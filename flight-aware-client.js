const winston = require('winston');
const Client = require('node-rest-client').Client;

const FLIGHT_AWARE_USERNAME = process.env.FLIGHT_AWARE_USERNAME;
const FLIGHT_AWARE_API_KEY = process.env.FLIGHT_AWARE_API_KEY;
const FLIGHT_AWARE_API_URL = process.env.FLIGHT_AWARE_API_URL;

const client = new Client({
    user: FLIGHT_AWARE_USERNAME,
    password: FLIGHT_AWARE_API_KEY
});

client.registerMethod('flightInfo', FLIGHT_AWARE_API_URL + 'FlightInfoEx', 'GET');
client.registerMethod('inFlightInfo', FLIGHT_AWARE_API_URL + 'InFlightInfo', 'GET');
client.on('error', function (err) {
    winston.log('warn', '1 something went wrong on the request', err.request.options);
});

console.log("client", FLIGHT_AWARE_API_URL);

module.exports = client;