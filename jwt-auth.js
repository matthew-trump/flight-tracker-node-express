
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt');
const express = require('express');
const router = express.Router();

const { RSA_PRIVATE_KEY, RSA_PUBLIC_KEY, JWT_ALGORITHM } = require('./jwt-auth-config');

const ADMIN_SESSION_EXPIRY_IN_SECONDS = process.env.ADMIN_SESSION_EXPIRY_IN_SECONDS || 3600 * 24 * 30;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const HTTP_UNAUTHORIZED = 401;

router.get('/', (req, res) => {
    res.json({ message: 'ok-login' });
})
router.post('/', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const expiresIn = parseInt(ADMIN_SESSION_EXPIRY_IN_SECONDS);
    if (validateUsernameAndPassword(username, password)) {
        const userId = getUserId(username);
        const jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
            algorithm: JWT_ALGORITHM,
            expiresIn: expiresIn,
            subject: userId
        });
        res.status(200).json({
            idToken: jwtBearerToken,
            expiresIn: expiresIn,
            subject: userId,
            username: username
        });
    } else {
        res.status(401).json({ message: "LOGIN UNSUCCESSFUL" });
    }
});


/** 
 * demo has a single admin user and password
 * for multiple admins, hook this up to database or use third-party service
*/
const validateUsernameAndPassword = function (username, password) {
    return (username === ADMIN_USERNAME && password === ADMIN_PASSWORD);
}
/**
 *  demo has static value for single admin user.
 **/
const getUserId = function (_) {
    return "" + 1001; //must return a string value for jwt
}

const jwtUnauthorizedError = (err, _, res, next) => {
    if (err.status == HTTP_UNAUTHORIZED) {
        return res.status(HTTP_UNAUTHORIZED).json({ error: "Invalid or missing Authorization key" });
    }
    next();
}
const jwtAuthorization = expressJwt({
    secret: RSA_PUBLIC_KEY,
    errorOnFailedAuth: false
});


module.exports = { jwtLogin: router, jwtUnauthorizedError, jwtAuthorization }