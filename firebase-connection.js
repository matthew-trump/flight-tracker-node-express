const firebase = require("firebase-admin");

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;

firebase.initializeApp({
    credential: firebase.credential.cert(require(FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: FIREBASE_DATABASE_URL
});

module.exports = firebase;