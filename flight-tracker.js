const winston = require('winston');
const flightAwareClient = require("./flight-aware-client");

const EVENTS_FILE = process.env.EVENTS_FILE;
//const FIREBASE_CREDENTIALS = process.env.FIREBASE_CREDENTIALS;
const TIMER_INTERVAL = process.env.TIMER_INTERVAL || 60000;


const EVENTS = require(EVENTS_FILE);


//var firebase = require("firebase-admin");
//const debug = require('debug')('flight-tracker');
/** 
const serviceAccount = require(FIREBASE_CREDENTIALS);

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseURL: databaseURL
});
**/

const parseDate = (dateString) => {
    return Date.parse(dateString);
}
class FlightTracker {

    constructor() {
        this.jsonData = {};
        this.currentJsonData = {};
        this.originalConfig = JSON.parse(JSON.stringify(EVENTS))
        this.currentFlightIndex = {};
        this.distinctFlights = {};

        this.initializeEvents();

        console.log("EVENTS", this.events);
        /**
        this.updateEvents();
        this.timeout = setInterval(() => {
            this.updateEvents();
        }, TIMER_INTERVAL);
         */

    }
    initializeEvents() {
        this.events = {};
        Object.keys(EVENTS).forEach((id) => {

            const event = EVENTS[id];
            console.log(id, event);
            this.distinctFlights[id] = [];
            this.jsonData[id] = [];
            this.currentJsonData[id] = [];
            const flights = event.type === "extrapolated" ? [] : event.flights;

            if (event.type === "extrapolated") {

                const firstDeparture = event.dateBegin + " " + event.timeScheduledDeparture;
                const firstArrival = event.dateBegin + " " + event.timeScheduledArrival;
                const lastDeparture = event.dateEnd + " " + event.timeScheduledDeparture;
                const lastArrival = event.dateEnd + " " + event.timeScheduledArrival;

                const firstDepartureTime = parseDate(firstDeparture);
                const firstArrivalTime = parseDate(firstArrival);

                const lastDepartureTime = parseDate(lastDeparture);
                const lastArrivalTime = parseDate(lastArrival);

                let iDepartureTime = firstDepartureTime;
                let iArrivalTime = firstArrivalTime;

                flights.push({
                    number: event.flightNumber,
                    origin: event.origin,
                    destination: event.destination,
                    departure: (new Date(iDepartureTime)).toUTCString(),
                    arrival: (new Date(iArrivalTime)).toUTCString()
                });

                if (lastDepartureTime > firstDepartureTime) {
                    while (iDepartureTime < lastDepartureTime) {
                        iDepartureTime = iDepartureTime + (24 * 3600000);
                        iArrivalTime = iArrivalTime + (24 * 3600000);

                        flights.push({
                            number: event.flightNumber,
                            origin: event.origin,
                            destination: event.destination,
                            departure: (new Date(iDepartureTime)).toUTCString(),
                            arrival: (new Date(iDepartureTime)).toUTCString()
                        });
                    }
                }


            }
            console.log("FLIGHTS", flights);
            for (let i = 0, len = flights.length; i < len; i++) {
                const flight = flights[i];

                if (this.distinctFlights[id].indexOf(flight.number) == -1) {
                    this.distinctFlights[id].push(flight.number);
                }
                flight.configured = {
                    departureTime: parseDate(flight.departure),
                    arrivalTime: parseDate(flight.arrival)
                };
                flight.updated = {
                    departureTime: flight.configured.departureTime,
                    takeoffTime: 0,
                    estimatedLandingTime: flight.configured.arrivalTime,
                    arrivalTime: flight.configured.arrivalTime,
                    enroute: null
                };
            }

            const becomeActiveAt = flights[0].configured.departureTime - (24 * 3600000);                   //one day before first departure time
            const becomeInactiveAt = flights[flights.length - 1].configured.arrivalTime + (6 * 3600000); //six hours after last scheduled arrival


            winston.log("info", id, "active from", new Date(becomeActiveAt), "to", new Date(becomeInactiveAt));
            winston.log("info", id, this.distinctFlights[id].length, "distinct flight(s) out of ", flights.length);
            this.events[id] = Object.assign({ id: id, flights: flights, becomeActiveAt: becomeActiveAt, becomeInactiveAt: becomeInactiveAt }, event);
        });


    }
    updateEvents() {
        let adjust = 0;

        const time = Date.now();
        Object.keys(this.events).forEach((id) => {
            const event = events[id];
            const active = (time > event.becomeActiveAt && time <= event.becomeInactiveAt);
            const currentFlightIndex = active ? this.getCurrentFlightIndex(id, time) : -1;

            if (currentFlightIndex != -1) {
                const ref = '/events/' + id + "/currentFlightIndex";
                winston.log("info", "writing currentFlightIndex to firebase", currentFlightIndex, ref);
                const dbRef = firebase.database().ref(ref);
                dbRef.set(currentFlightIndex);

                const flight = event.flights[currentFlightIndex];
                const isEnroute = flight.updated.departureTime < time && time < flight.updated.arrivalTime;
                const threshold = isEnroute ? thresholdEnroute : thresholdNormal;

                if (!this.jsonData[id][currentFlightIndex] || time - this.jsonData[id][currentFlightIndex].recorded > threshold) {
                    winston.log("info", "UPDATING event", id, currentFlightIndex);
                    this.updateFromFlightAware(event, time, adjust);
                }
            }
            this.events[id] = Object.assign({}, { currentFlightIndex: currentFlightIndex, active: active }, event)
        })
    }


    updateFromFlightAware(event, time, adjust) {
        const flight = event.flights[event.currentFlightIndex];

        this.getFlightInfoExNext(null, event.id, flight.number, { adjust: adjust, time: time, flightIndex: event.currentFlightIndex });

        if (flight.updated.departureTime < time && time < flight.updated.arrivalTime) {
            this.getInFlightInfo(null, event.id, flight.number, { adjust: adjust, time: time, flightIndex: event.currentFlightIndex });
        }

    }
    getFlightInfoExNext(res, id, flightNumber, options) {
        const flightInfoArgs = {
            parameters: {
                ident: flightNumber,
                howMany: 3
            }
        };
        winston.log('verbose', "HTTP FlightXML2.FlightInfoEx", id, options.flightIndex, flightNumber);

        flightAwareClient.methods.flightInfo(flightInfoArgs, this.handleFlightInfo.bind(this))
            .on('error', function (err) {
                if (res) {
                    res.json({ "message": "ERROR IN HTTP CONNECTION" });
                }
                winston.log('warn', "ERROR IN HTTP CONNECTION", err.request.options);
            });;;
    }
    handleFlightInfo(data, response) {

        if (data.FlightInfoExResult) {
            const adjusted = adjustFlightTimes(data.FlightInfoExResult.flights, options.adjust);
            const time = Math.floor((options.time ? options.time : Date.now()) / 1000);

            const flight = this.getFlight(adjusted, options.flightIndex, id);


            const json = {};
            json.eventId = id;
            json.flightIndex = options.flightIndex;

            if (!flight) {

                json.message = "ERROR " + id + " flight " + options.flightIndex + " not found among adjusted flights, time=" + (new Date(time * 1000), time);

                winston.log("warn", json.message);

            } else {
                json.ident = flight.ident;
                let departureTime = flight.filed_departuretime * 1000;
                let takeoffTime = flight.actualdeparturetime > 0 ? flight.actualdeparturetime * 1000 : -1;
                let estimatedLandingTime = takeoffTime != -1 ? flight.estimatedarrivaltime * 1000 : -1;

                let arrivalTime = flight.estimatedarrivaltime * 1000;

                json.departure = new Date(departureTime);
                json.departureTime = departureTime;


                if (takeoffTime != -1) {
                    json.takeoff = new Date(takeoffTime);
                    json.takeoffTime = takeoffTime;

                }
                if (estimatedLandingTime != -1) {
                    json.estimatedLanding = new Date(estimatedLandingTime);
                    json.estimatedLandingTime = estimatedLandingTime;

                }

                json.arrival = new Date(arrivalTime);
                json.arrivalTime = arrivalTime;

                json.recorded = Date.now();

                currentFlightIndex[id] = json.flightIndex;
                jsonData[id][json.flightIndex] = json;

                this.updateEventFlightTimes(json);

                const ref = '/events/' + id + "/flights/" + json.flightIndex;

                winston.log("info", "writing to firebase", json.ident, ref);
                const flightRef = firebase.database().ref(ref);

                flightRef.update(json);
            }
            if (res) {
                res.json(json);
            }
        }

    }


    screenEventFlights(flights, id) {

        const configuredFlights = events[id].flights

        const firstFlight = configuredFlights[0];
        const lastFlight = configuredFlights[configuredFlights.length - 1];

        const windowBegin = Math.floor((Date.parse(firstFlight.departure) - (3600000 * 6)) / 1000);
        const windowEnd = Math.floor((Date.parse(lastFlight.departure) + (3600000 * 6)) / 1000);

        const filteredFlights = flights.filter((flight) => {
            return flight.filed_departuretime > windowBegin && flight.filed_departuretime < windowEnd;
        });
        return filteredFlights;
    }
    adjustFlightTimes(flights, adjust) {
        if (adjust == 0) {
            return flights;
        }
        const _flights = [];
        const _fields = ['filed_time', 'filed_departuretime', 'actualdeparturetime', 'estimatedarrivaltime', 'actualarrivaltime'];
        for (let i = 0, len = flights.length; i < len; i++) {
            const _flight = flights[i];
            for (let j = 0, len2 = _fields.length; j < len2; j++) {
                let _field = _fields[j];
                if (typeof _flight[_field] !== 'undefined' && _flight[_field] > 0) {
                    _flight[_field] = _flight[_field] + adjust;
                }
            }
            _flights.push(_flight);
        }
        return _flights;
    }
    getCurrentFlightIndex(id, time) {
        const flights = events[id].flights;

        for (let i = 0, len = flights.length; i < len; i++) {
            const flight = flights[i];
            const updatedDepartureTime = flight.updated.departureTime;
            const updatedArrivalTime = flight.updated.arrivalTime;

            const beginAt = updatedDepartureTime - preBuffer;
            const endAt = updatedArrivalTime + postBuffer;

            if (time < beginAt) {
                return i - 1;
            }
            if (time < endAt) {
                return i;
            }
        }
        return -1;
    }
    updateEventFlightTimes(json) {
        const event = events[json.eventId];
        const flight = event.flights[json.flightIndex];

        if (flight.number === json.ident) {
            const currentDepartureTime = flight.updated.departureTime;
            const currentArrivalTime = flight.updated.arrivalTime;

            const newDepartureTime = json.departureTime;
            const newArrivalTime = json.arrivalTime;

            const deltaDepartureTime = newDepartureTime - currentDepartureTime;
            const deltaArrivalTime = newArrivalTime - currentArrivalTime;

            if (deltaDepartureTime != 0) {
                winston.log("info", "Updating " + json.eventId + ":" + json.flightIndex + " departure=" + json.departure + " (delta=" + deltaDepartureTime + ")");
                event.flights[json.flightIndex].updated.departureTime = newDepartureTime;
            }
            if (deltaArrivalTime != 0) {
                winston.log("info", "Updating " + json.eventId + ":" + json.flightIndex + " arrival=" + json.arrival + " (delta=" + deltaArrivalTime + ")");
                event.flights[json.flightIndex].updated.arrivalTime = newArrivalTime;
            }
        } else {
            //sanity check. this should never happen
            winston.log("error", "ERROR IDENT MISMATCH #56---CANNOT UPDATE FLIGHT TIMES", flight.number, json.ident);
        }

    }
    getFlight(screened, index, id) {

        const configuredDepartureTime = events[id].flights[index].configured.departureTime;

        for (let i = 0, len = screened.length; i < len; i++) {
            const filedDepartureTime = screened[i].filed_departuretime * 1000;
            const diffDepartureTimes = Math.abs(configuredDepartureTime - filedDepartureTime);
            if (diffDepartureTimes < 6 * 3600000) {
                return screened[i];
            }
        }
        return null;
    }

    getInFlightInfo(res, id, flightNumber, options) {
        var args = {
            parameters: {
                ident: flightNumber
            }
        };
        winston.log("verbose", "HTTP FlightXML2.InFlightInfo", id, options.flightIndex, flightNumber);
        flightAwareClient.methods.inFlightInfo(args, function (data, response) {
            var retobj = data.InFlightInfoResult;


            if (retobj) {

                let time = Math.floor((options.time ? options.time : Date.now()) / 1000);


                //console.log(retobj.departureTime);

                var json = {};
                json.eventId = id;
                json.flightIndex = options.flightIndex;

                json.enroute = {
                    time: retobj.timestamp * 1000,
                    departureTime: retobj.departureTime * 1000,
                    arrivalTime: retobj.arrivalTime * 1000,
                    latitude: retobj.latitude,
                    longitude: retobj.longitude,
                    altitude: retobj.altitude,
                    heading: retobj.heading,
                    groundspeed: retobj.groundspeed

                };

                if (currentJsonData[id][json.flightIndex]) {
                    let current = currentJsonData[id][json.flightIndex];


                    let changeinseconds = (json.enroute.time - current.enroute.time) / 1000;
                    //let   changeinminutes       = changeinseconds / 60.0;
                    let changeinfeet = (json.enroute.altitude * 100) - (current.enroute.altitude * 100);

                    //console.log("changeinseconds",changeinseconds,json.enroute.time,current.enroute.time);
                    //in feet per second
                    if (changeinseconds > 0) {
                        let rateofclimb = changeinfeet / changeinseconds;
                        json.enroute.rateofclimb = rateofclimb;
                    }
                    //



                    //


                }
                var ref = '/events/' + id + "/flights/" + json.flightIndex + "/enroute";

                winston.log("info", "writing enroute to firebase", ref);
                var flightRef = firebase.database().ref(ref);
                try {
                    flightRef.update(json.enroute);
                } catch (exc) {
                    winston.log('warn', 'could not update firebase with enroute', ref, exc);
                }

                currentJsonData[id][json.flightIndex] = json;


                if (res) {
                    res.json(json);
                }


            }

        }).on('error', function (err) {
            if (res) {
                res.json({ "message": "ERROR IN HTTP CONNECTION" });
            }

            winston.log("warn", "ERROR IN HTTP CONNECTION", err.request.options);
        });;;
    }
    getFlightInfoExNext(res, id, flightNumber, options) {
        var flightInfoArgs = {
            parameters: {
                ident: flightNumber,
                howMany: 3
            }
        };
        winston.log('verbose', "HTTP FlightXML2.FlightInfoEx", id, options.flightIndex, flightNumber);
        client.methods.flightInfo(flightInfoArgs, function (data, response) {


            if (data.FlightInfoExResult) {
                let adjusted = adjustFlightTimes(data.FlightInfoExResult.flights, options.adjust);
                let time = Math.floor((options.time ? options.time : Date.now()) / 1000);

                let flight = getFlight(adjusted, options.flightIndex, id);


                var json = {};
                json.eventId = id;
                json.flightIndex = options.flightIndex;

                if (!flight) {

                    json.message = "ERROR " + id + " flight " + options.flightIndex + " not found among adjusted flights, time=" + (new Date(time * 1000), time);

                    winston.log("warn", json.message);

                } else {
                    json.ident = flight.ident;
                    let departureTime = flight.filed_departuretime * 1000;
                    let takeoffTime = flight.actualdeparturetime > 0 ? flight.actualdeparturetime * 1000 : -1;
                    let estimatedLandingTime = takeoffTime != -1 ? flight.estimatedarrivaltime * 1000 : -1;

                    let arrivalTime = flight.estimatedarrivaltime * 1000;

                    json.departure = new Date(departureTime);
                    json.departureTime = departureTime;


                    if (takeoffTime != -1) {
                        json.takeoff = new Date(takeoffTime);
                        json.takeoffTime = takeoffTime;

                    }
                    if (estimatedLandingTime != -1) {
                        json.estimatedLanding = new Date(estimatedLandingTime);
                        json.estimatedLandingTime = estimatedLandingTime;

                    }

                    json.arrival = new Date(arrivalTime);
                    json.arrivalTime = arrivalTime;








                    json.recorded = Date.now();

                    currentFlightIndex[id] = json.flightIndex;
                    jsonData[id][json.flightIndex] = json;


                    updateEventFlightTimes(json);

                    var ref = '/events/' + id + "/flights/" + json.flightIndex;

                    winston.log("info", "writing to firebase", json.ident, ref);
                    var flightRef = firebase.database().ref(ref);

                    flightRef.update(json);
                }




                if (res) {
                    res.json(json);
                }


            }

        }).on('error', function (err) {
            if (res) {
                res.json({ "message": "ERROR IN HTTP CONNECTION" });
            }

            winston.log('warn', "ERROR IN HTTP CONNECTION", err.request.options);
        });;;
    }

}

module.exports = { flightTracker: new FlightTracker() }