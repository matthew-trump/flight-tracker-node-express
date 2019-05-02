const express = require('express');
const router = express.Router();

var toobusy = require('node-toobusy');



const CONFIG_FILE = process.env.CONFIG_FILE;




const DATABASE_URL = process.env.DATABASE_URL;



const originalConfig = JSON.parse(JSON.stringify(events));



const config = require(CONFIG_FILE);
const thresholdNormal = 60000; //one minute
const thresholdEnroute = 10000; //ten seconds
const preBuffer = 3600000 * 48;
const postBuffer = 3600000 * 2;

const databaseURL = DATABASE_URL;






router.use(function (req, res, next) {
    if (toobusy()) {
        res.status(503).json({ "message": "SERVER IS TOO BUSY" });
    } else {
        next();
    }
});

router.get('/', function (req, res, next) {
    res.json({ message: String(new Date()) });
});

router.get('/config/events', function (req, res, next) {
    return res.json(originalConfig);
});

router.get('/config/event/:eventId', function (req, res, next) {
    var original = originalConfig[req.params.eventId];
    if (original) {
        return res.json(original);
    } else {
        return res.json({ message: "INVALID EVENT ID" });
    }

});


router.get('/tracker/:eventId/next', function (req, res, next) {
    var eventId = req.params.eventId;
    var time = 0;
    var adddays = 0;
    var adjust = 0;
    var now = Date.now();

    if (req.query.time) {
        time = parseInt(req.query.time);
        adjust = (time - now) / 1000;

    } else if (req.query.adddays) {
        adjust = (24 * 3600) * parseInt(req.query.adddays); //adjust is in seconds
        time = now + adjust * 1000;                       //time adjusted from now
    } else {
        adjust = 0;
        time = now;
    }

    if (eventId && (typeof events[eventId] !== 'undefined')) {
        var event = events[eventId];
        if (event.active && event.currentFlightIndex >= 0) {

            if (!jsonData[eventId][event.currentFlightIndex]) {
                updateFromFlightAware(event, time, adjust);
                res.send({ message: "WAITING FOR UPDATE. PLEASE RELOAD.", time: time, eventId: eventId });
            } else {


                var json = jsonData[eventId][event.currentFlightIndex];
                var isEnroute = json.departureTime < time && time < json.arrivalTime;
                if (!isEnroute) {
                    delete json.enroute;
                    //delete currentJsonData[eventId][event.currentFlightIndex];
                } else if (currentJsonData[eventId][event.currentFlightIndex]) {
                    json.enroute = currentJsonData[eventId][event.currentFlightIndex].enroute;

                    if (!json.enroute) {
                        json.enroute = {};
                    }
                }

                let threshold = isEnroute ? thresholdEnroute : thresholdNormal;
                if (Date.now() - json.recorded > threshold) {
                    updateFromFlightAware(event, time, adjust)
                }

                res.json(json);
            }
        } else {
            res.json({ message: "OUTSIDE FLIGHT REPORTING WINDOW FOR EVENT", time: time });
        }
    } else {
        res.status(400).json({ message: "INVALID EVENT ID" });
    }

});

router.use(function (req, res, next) {
    res.status(404).send({ "message": "NOT FOUND" });
})

module.exports = router;
