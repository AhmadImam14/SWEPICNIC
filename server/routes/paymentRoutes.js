const express = require('express');
const { initializePayment, verifyPayment, webhook } = require('../controllers/paymentController');

const router = express.Router();

router.post('/initialize', initializePayment);
router.get('/verify/:reference', verifyPayment);
router.post('/webhook', webhook);

module.exports = router;
