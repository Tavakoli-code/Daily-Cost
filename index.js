import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import pgSession from "connect-pg-simple";
import moment from "moment-jalaali";

const app = express();
const port = process.env.PORT || 3000;
const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "daily_cost",
    password: "xyz.9870",
    port: 5432,
});
db.connect();

moment.loadPersian({ dialect: "persian-modern" });
app.use(express.json());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(session({
    store: new (pgSession(session))({
        pool: db
    }),
    secret: "hibye",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 2 }
}));

app.locals.formatJalali = (date, format = "jYYYY/jMM/jDD") => {
    if (!date) return "";
    return moment(date).format(format);
};

function requireLogin(req, res, next) {
    if (!req.session.userID) {
        return res.render("login.ejs", { error: "Please first login or signup." });
    }
    next();
}

// GET
app.get("/", (req, res) => {
    res.render("login.ejs");
});

app.get("/index", requireLogin, async (req, res) => {
    let date = new Date();
    date = date.toISOString().slice(0, 10);
    const userID = req.session.userID;
    const categories = await db.query("SELECT * FROM category WHERE user_id = $1", [userID]);
    const costs = await db.query("SELECT * FROM costs WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'", [userID]);

    const jalaliCosts = costs.rows.map(item => ({
        ...item,
        jalaliDate: moment(item.date).format("jMM/jDD"),
    }));

    res.render("index.ejs", { categories: categories.rows, costs: jalaliCosts });
})

app.get("/reports", requireLogin, async (req, res) => {

    res.render("reports.ejs")
})

app.get("/signup", (req, res) => {
    res.render("signup.ejs");
});

app.get("/category", requireLogin, async (req, res) => {
    const userID = req.session.userID;
    const categoryResult = await db.query("SELECT * FROM category WHERE user_id = $1", [userID]);
    const sourceResult = await db.query("SELECT * FROM sources WHERE user_id = $1", [userID]);
    res.render("category.ejs", { categories: categoryResult.rows, sources: sourceResult.rows });
})

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.redirect("/index");
        }

        // Clear cookie manually to be extra sure
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

app.get("/delete_category/:id", requireLogin, async (req, res) => {
    const id = req.params.id;
    const userID = req.session.userID;
    try {
        await db.query("DELETE FROM costs WHERE category_id = $1 AND user_id = $2", [id, userID]);
        await db.query("DELETE FROM category WHERE id = $1 AND user_id = $2", [id, userID]);
        res.redirect("/category");
    } catch (err) {
        console.error("Error deleting Category:", err);
        res.redirect("/category");
    }
})

app.get("/delete_cost/:id", requireLogin, async (req, res) => {
    const id = req.params.id;
    const userID = req.session.userID;
    try {
        await db.query("DELETE FROM costs WHERE id = $1 AND user_id = $2", [id, userID]);
        res.redirect("/index");
    } catch (err) {
        console.error("Error deleting Cost:", err);
        res.redirect("/index");
    }
})

app.get("/delete_source/:id", requireLogin, async (req, res) => {
    const id = req.params.id;
    try {
        await db.query("DELETE FROM sources WHERE id = $1", [id]);
        res.redirect("/category");
    } catch (err) {
        console.error("Error deleteing source:", err);
        res.redirect("/category");
    }
})

// POST
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length > 0) {
            const userPass = result.rows[0].pass;
            const isMatch = await bcrypt.compare(password, userPass);
            if (!isMatch) {
                return res.render("login.ejs", { error: "Invalid password", email, password });
            }
            req.session.userID = result.rows[0].id;
            return res.redirect("/index");
        } else {
            return res.render("login.ejs", { error: "Email is not registered.", email });
        }
    } catch (err) {
        console.error("Error login user: err", err);
        res.render("login.ejs", { error: "Login error, please try again.", email, password });
    }
});

app.post("/add_user", async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render("signup.ejs", {
            error: "Passwords do not match",
            email,
            password,
            confirmPassword,
        });
    }

    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length > 0) {
            return res.render("signup.ejs", { error: "Email already registered", email });
        }

        // Hash password and insert
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query("INSERT INTO users (email, pass) VALUES ($1, $2)", [email, hashedPassword]);

        res.render("login.ejs");
    } catch (err) {
        console.error("Error inserting user:", err);
        res.render("signup.ejs", { error: "Database error, please try again." });
    }
});

app.post("/add_expense", requireLogin, async (req, res) => {
    const { amount, category, year, month, day, notes } = req.body;
    const userID = req.session.userID;
    const date = moment(`${year}/${month}/${day}`, "jYYYY/jMM/jDD").format("YYYY-MM-DD");
    try {
        await db.query("INSERT INTO costs (amount, note, category_id, date, user_id) VALUES ($1, $2, $3, $4, $5)", [amount, notes, category, date, userID]);
        res.redirect("/index");
    } catch (err) {
        console.error("Error inserting to table costs:", err);
        res.redirect("/index");
    }
})

app.post("/add_category", requireLogin, async (req, res) => {
    const category = req.body.new_category;
    const userID = req.session.userID;
    try {
        const existing = await db.query("SELECT * FROM category WHERE category = $1 AND user_id = $2", [category, userID]);
        if (existing.rows.length === 0) {
            await db.query("INSERT INTO category (category, user_id) VALUES ($1, $2)", [category, userID]);
        }
        res.redirect("/category");
    } catch (err) {
        console.error("Error inserting category:", err);
        const categories = await db.query("SELECT * FROM category");
        res.render("index.ejs", {
            categories: categories.rows,
            error: "Database error, please try again."
        });
    }
});

app.post("/edit_cost", requireLogin, async (req, res) => {
    const id = req.body.id;
    const amount = req.body.amount;
    const categoryId = req.body.category;
    const year = req.body.year;
    const month = req.body.month;
    const day = req.body.day;
    const note = req.body.notes;
    const date = moment(`${year}/${month}/${day}`, "jYYYY/jMM/jDD").format("YYYY-MM-DD");

    try {
        await db.query("UPDATE costs SET amount = $1, note = $2, category_id = $3, date = $4 WHERE id = $5", [amount, note, categoryId, date, id]);
        res.redirect("/index");
    } catch (err) {
        console.error("Error updating cost:", err);
        res.redirect("/index");
    }
})

app.post("/add_source", requireLogin, async (req, res) => {
    const { name, amount, date } = req.body;
    const userID = req.session.userID;
    try {
        await db.query("INSERT INTO sources (name, amount, date, user_id) VALUES ($1, $2, $3, $4)", [name, amount, date, userID]);
        res.redirect("/category");
    } catch (err) {
        console.error("Error adding new source:", err);
        res.redirect("/category");
    }
})

app.post("/edit_source", requireLogin, async (req, res) => {
    const { name, amount, date, sourceId } = req.body;
    try {
        await db.query("UPDATE sources SET name = $1, amount = $2, date = $3 WHERE id = $4", [name, amount, date, sourceId]);
        res.redirect("/category");
    } catch (err) {
        console.error("Error updating source:", err);
        res.redirect("/category");
    }
})

app.post("/report_date", async (req, res) => {
    const { year, month } = req.body;
    const userID = req.session.userID;

    const startGregorian = moment(`${year}/${month}/01`, "jYYYY/jMM/jDD").format("YYYY-MM-DD");
    const endGregorian = moment(`${year}/${month}/01`, "jYYYY/jMM/jDD").endOf("jMonth").format("YYYY-MM-DD");

    try {
        const source = await db.query("SELECT SUM(amount) as total FROM sources WHERE user_id = $1 AND date BETWEEN $2 AND $3", [userID, startGregorian, endGregorian]);
        const spent = await db.query("SELECT SUM(amount) as total FROM costs WHERE user_id = $1 AND date BETWEEN $2 AND $3", [userID, startGregorian, endGregorian]);
        const category = await db.query("SELECT sum(amount), category.category FROM costs INNER JOIN category ON costs.category_id = category.id WHERE costs.user_id = $1 and costs.date BETWEEN $2 AND $3 GROUP BY category", [userID, startGregorian, endGregorian]);

        const totalSource = source.rows[0].total;
        const totalSpent = spent.rows[0].total;
        const totalPerCategory = category.rows;
        res.render("reports.ejs", { year, month, totalSource, totalSpent, totalPerCategory });
    } catch (err) {
        console.error("Error running report query:", err);
        res.redirect("/reports");
    }
});

app.listen(port, () => {
    console.log(`✅ Server running on ${port}`);

});
