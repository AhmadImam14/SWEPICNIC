const express = require('express');
const { verifyStudent } = require('../controllers/studentController');

const router = express.Router();

router.post('/verify', verifyStudent);

module.exports = router;
