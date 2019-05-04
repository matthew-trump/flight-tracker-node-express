const logger = require("./logger");
const flightAwareClient = require("./flight-aware-client");
const firebaseConnection = require("./firebase-connection");

const EVENTS_FILE = process.env.EVENTS_FILE;
const TIMER_INTERVAL = process.env.TIMER_INTERVAL || 60000 * 30;


const EVENTS = require(EVENTS_FILE);

const PRE_BUFFER = 3600000 * 48;
const POST_BUFFER = 3600000 * 2;
const THRESHOLD_NORMAL = 60000; //one minute
const THRESHOLD_ENROUTE = 10000; //ten seconds

const parseDate = (dateString) => {
    return Date.parse(dateString);
}
class FlightTracker {

    constructor() {
        this.jsonData = {};
        this.currentFlightIndex = {};
        this.currentJsonData = {};
        this.originalConfig = JSON.parse(JSON.stringify(EVENTS));
        this.currentFlightIndex = {};
        this.distinctFlights = {};
        this.eventStatus = {}
        this.initializeEvents();

        this.updateEvents();

        this.timeout = setInterval(() => {
            this.updateEvents();
        }, TIMER_INTERVAL);

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


            logger.log("info", id, "active from", new Date(becomeActiveAt), "to", new Date(becomeInactiveAt));
            logger.log("info", id, this.distinctFlights[id].length, "distinct flight(s) out of ", flights.length);
            this.events[id] = Object.assign({ id: id, flights: flights, becomeActiveAt: becomeActiveAt, becomeInactiveAt: becomeInactiveAt }, event);
        });


    }
    updateEvents() {
        let adjust = 0;

        const time = Date.now();
        Object.keys(this.events).forEach((id) => {
            const event = this.events[id];
            const active = (time > event.becomeActiveAt && time <= event.becomeInactiveAt);
            const currentFlightIndex = active ? this.getCurrentFlightIndex(id, time) : -1;
            this.eventStatus[id] = {
                active: active,
                currentFlightIndex: currentFlightIndex,
            }

            if (currentFlightIndex != -1) {
                const ref = '/events/' + id + "/currentFlightIndex";
                logger.log("info", "writing currentFlightIndex to firebase", currentFlightIndex, ref);
                const dbRef = firebaseConnection.database().ref(ref);
                dbRef.set(currentFlightIndex);

                const flight = event.flights[currentFlightIndex];
                const isEnroute = flight.updated.departureTime < time && time < flight.updated.arrivalTime;
                const threshold = isEnroute ? THRESHOLD_ENROUTE : THRESHOLD_NORMAL;

                if (!this.jsonData[id][currentFlightIndex] || time - this.jsonData[id][currentFlightIndex].recorded > threshold) {
                    logger.log("info", "UPDATING event", id, currentFlightIndex);
                    this.updateFromFlightAware(event, time, adjust);
                }
            }
        })
    }


    updateFromFlightAware(event, time, adjust) {
        const status = this.eventStatus[event.id];
        console.log("event.currentFlightIndex", status.currentFlightIndex);
        const flight = event.flights[status.currentFlightIndex];

        this.getFlightInfoExNext(null, event.id, flight.number, { adjust: adjust, time: time, flightIndex: status.currentFlightIndex });

        if (flight.updated.departureTime < time && time < flight.updated.arrivalTime) {
            this.getInFlightInfo(null, event.id, flight.number, { adjust: adjust, time: time, flightIndex: status.currentFlightIndex });
        }

    }
    getFlightInfoExNext(res, id, flightNumber, options) {
        const flightInfoArgs = {
            parameters: {
                ident: flightNumber,
                howMany: 3
            }
        };
        logger.log('verbose', "HTTP FlightXML2.FlightInfoEx", id, options.flightIndex, flightNumber);

        flightAwareClient.methods.flightInfo(flightInfoArgs, (data, response) => {
            this.handleFlightInfo(data, id, options);
        }).on('error', function (err) {
            if (res) {
                res.json({ "message": "ERROR IN HTTP CONNECTION" });
            }
            logger.log('warn', "ERROR IN HTTP CONNECTION", err.request.options);
        });;;
    }
    handleFlightInfo(data, id, options) {
        console.log("handleFlightInfo", data)
        if (data.FlightInfoExResult) {
            const adjusted = this.adjustFlightTimes(data.FlightInfoExResult.flights, options.adjust);
            const time = Math.floor((options.time ? options.time : Date.now()) / 1000);

            const flight = this.getFlight(adjusted, options.flightIndex, id);


            const json = {};
            json.eventId = id;
            json.flightIndex = options.flightIndex;

            if (!flight) {

                json.message = "ERROR " + id + " flight " + options.flightIndex + " not found among adjusted flights, time=" + (new Date(time * 1000), time);

                logger.log("warn", json.message);

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

                this.currentFlightIndex[id] = json.flightIndex;
                this.jsonData[id][json.flightIndex] = json;

                this.updateEventFlightTimes(json);

                const ref = '/events/' + id + "/flights/" + json.flightIndex;

                logger.log("info", "writing to firebase", json.ident, ref);
                const flightRef = firebaseConnection.database().ref(ref);

                flightRef.update(json);
            }
            /**
            if (res) {
                res.json(json);
            }
             */
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
        const flights = this.events[id].flights;

        for (let i = 0, len = flights.length; i < len; i++) {
            const flight = flights[i];
            const updatedDepartureTime = flight.updated.departureTime;
            const updatedArrivalTime = flight.updated.arrivalTime;

            const beginAt = updatedDepartureTime - PRE_BUFFER;
            const endAt = updatedArrivalTime + POST_BUFFER;

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
        const event = this.events[json.eventId];
        const flight = event.flights[json.flightIndex];

        if (flight.number === json.ident) {
            const currentDepartureTime = flight.updated.departureTime;
            const currentArrivalTime = flight.updated.arrivalTime;

            const newDepartureTime = json.departureTime;
            const newArrivalTime = json.arrivalTime;

            const deltaDepartureTime = newDepartureTime - currentDepartureTime;
            const deltaArrivalTime = newArrivalTime - currentArrivalTime;

            if (deltaDepartureTime != 0) {
                logger.log("info", "Updating " + json.eventId + ":" + json.flightIndex + " departure=" + json.departure + " (delta=" + deltaDepartureTime + ")");
                event.flights[json.flightIndex].updated.departureTime = newDepartureTime;
            }
            if (deltaArrivalTime != 0) {
                logger.log("info", "Updating " + json.eventId + ":" + json.flightIndex + " arrival=" + json.arrival + " (delta=" + deltaArrivalTime + ")");
                event.flights[json.flightIndex].updated.arrivalTime = newArrivalTime;
            }
        } else {
            //sanity check. this should never happen
            logger.log("error", "ERROR IDENT MISMATCH #56---CANNOT UPDATE FLIGHT TIMES", flight.number, json.ident);
        }

    }
    getFlight(screened, index, id) {

        const configuredDepartureTime = this.events[id].flights[index].configured.departureTime;

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
        logger.log("verbose", "HTTP FlightXML2.InFlightInfo", id, options.flightIndex, flightNumber);
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

                logger.log("info", "writing enroute to firebase", ref);
                var flightRef = firebaseConnection.database().ref(ref);
                try {
                    flightRef.update(json.enroute);
                } catch (exc) {
                    logger.log('warn', 'could not update firebase with enroute', ref, exc);
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

            logger.log("warn", "ERROR IN HTTP CONNECTION", err.request.options);
        });;;
    }
    getEnrouteJson(eventId, time, adjust) {
        if (!this.jsonData[eventId] || !this.eventStatus[eventId]) return null;
        const event = this.events[eventId];
        const currentFlightIndex = this.eventStatus[eventId].currentFlightIndex;
        const active = this.eventStatus[eventId].active;
        if (active && currentFlightIndex >= 0) {
            const json = this.jsonData[eventId][currentFlightIndex];
            const isEnroute = json.departureTime < time && time < json.arrivalTime;
            if (!isEnroute) {
                delete json.enroute;
                //delete this.currentJsonData[eventId][event.currentFlightIndex];
            } else if (this.currentJsonData[eventId][currentFlightIndex]) {
                json.enroute = this.currentJsonData[eventId][currentFlightIndex].enroute;
                if (!json.enroute) {
                    json.enroute = {};
                }
            }
            const threshold = isEnroute ? THRESHOLD_ENROUTE : THRESHOLD_NORMAL;
            if (Date.now() - json.recorded > threshold) {
                this.updateFromFlightAware(event, time, adjust)
            }
            return json;
        } else {
            return -1;
        }
    }

}

module.exports = { FlightTracker: new FlightTracker() }