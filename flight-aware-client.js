const Client = require('node-rest-client').Client;
const FLIGHT_AWARE_CREDENTIALS = process.env.FLIGHT_AWARE_CREDENTIALS;
const FLIGHT_AWARE_API_URL = process.FLIGHT_AWARE_API_URL;

const fxmlCredentials = require(FLIGHT_AWARE_CREDENTIALS);
const fxmlUrl = FLIGHT_AWARE_API_URL;

const client = new Client({
    user: fxmlCredentials.username,
    password: fxmlCredentials.apiKey
});
client.registerMethod('flightInfo', fxmlUrl + 'FlightInfoEx', 'GET');
client.registerMethod('inFlightInfo', fxmlUrl + 'InFlightInfo', 'GET');
client.on('error', function (err) {
    winston.log('warn', '1 something went wrong on the request', err.request.options);
});

module.exports = client;