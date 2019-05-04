const express = require('express');
const router = express.Router();
const toobusy = require('node-toobusy');
const { FlightTracker } = require('./flight-tracker');


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
    return res.json(Object.keys(FlightTracker.originalConfig).map(key => Object.assign({}, { id: key }, FlightTracker.originalConfig[key])));
});

router.get('/config/event/:eventId', function (req, res, next) {
    var original = FlightTracker.originalConfig[req.params.eventId];
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

    if (eventId && (typeof FlightTracker.events[eventId] !== 'undefined')) {
        const json = FlightTracker.getEnrouteJson(eventId, time, adjust);
        if (!json) {
            res.send({ message: "WAITING FOR UPDATE. PLEASE RELOAD.", time: time, eventId: eventId });
        } else if (json === -1) {
            res.json({ message: "OUTSIDE FLIGHT REPORTING WINDOW FOR EVENT", time: time });
        } else {
            res.json(json);
        }
    } else {
        res.status(400).json({ message: "INVALID EVENT ID" });
    }

});

router.use(function (req, res, next) {
    res.status(404).send({ "message": "NOT FOUND" });
})

module.exports = router;
