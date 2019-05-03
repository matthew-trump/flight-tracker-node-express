const express = require('express');
const router = express.Router();

router.get('/', (_, res) => {
    res.status(200).json({ message: "OK", value: new Date() });
});

module.exports = router;