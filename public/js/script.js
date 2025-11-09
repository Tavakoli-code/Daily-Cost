// show password toggle
function showPassword() {
    var passwordInput = document.getElementById('password');
    // var passwordToggleCheckbox = document.getElementById('showPass');

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
    }
    else {
        passwordInput.type = "password";
    }
}


function showConfirmPassword() {
    var passwordInput = document.getElementById('confirmPassword');
    // var passwordToggleCheckbox = document.getElementById('showPass');

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
    }
    else {
        passwordInput.type = "password";
    }
}