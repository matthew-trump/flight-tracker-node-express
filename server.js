const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const ping = require('./ping');
const { jwtAuthorization, jwtLogin, jwtUnauthorizedError } = require('./jwt-auth');
const FlightTracker = require('./flight-tracker');
const api = require("./api");


const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/', express.static(path.join(__dirname, 'public')));
app.use("/ping", ping);

app.use("/login", jwtLogin);

app.use("/api",
    jwtAuthorization,
    jwtUnauthorizedError,
    api);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log("");
    console.log("FLIGHT TRACKER SERVER APPLICATION");
    console.log(`listening on port ${PORT}`);
    console.log("ENVIRONMENT", process.env.ENVIRONMENT);

});
;
