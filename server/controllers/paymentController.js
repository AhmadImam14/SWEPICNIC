const axios = require('axios');
const crypto = require('crypto');
const Student = require('../models/Student');
const { generateReference } = require('../utils/generateReference');

const PICNIC_FEE = Number(process.env.PICNIC_FEE || 5000);
const PAYMENT_DEADLINE = process.env.PAYMENT_DEADLINE ? new Date(process.env.PAYMENT_DEADLINE) : null;
const FLUTTERWAVE_BASE_URL = (process.env.FLUTTERWAVE_API_BASE_URL || 'https://api.flutterwave.com/v4').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');

const buildCustomerEmail = (student) => {
  const regNumber = String(student?.registrationNumber || '').trim().toLowerCase();
  const cleanedLocalPart = regNumber.replace(/[^a-z0-9]/g, '').slice(0, 60) || 'student';
  return `${cleanedLocalPart}@student.mail`;
};

const getPaymentStatusFromFlutterwave = (tx) => {
  const status = String(tx?.status || tx?.event || '').toLowerCase();
  return status;
};

const isDeadlinePassed = () => {
  if (!PAYMENT_DEADLINE || Number.isNaN(PAYMENT_DEADLINE.getTime())) {
    return false;
  }

  return new Date() >= PAYMENT_DEADLINE;
};

const verifyFlutterwaveSignature = (payload, signature) => {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH || process.env.FLUTTERWAVE_SECRET_KEY || '';
  if (!secretHash || !signature) return false;

  const expectedHash = crypto.createHmac('sha256', secretHash).update(JSON.stringify(payload)).digest('hex');
  return expectedHash === signature;
};

const initializePayment = async (req, res) => {
  try {
    const { registrationNumber } = req.body || {};

    if (!registrationNumber || !String(registrationNumber).trim()) {
      return res.status(400).json({ success: false, message: 'Registration number is required.' });
    }

    const normalized = String(registrationNumber).trim().replace(/\s+/g, '').toUpperCase();

    if (isDeadlinePassed()) {
      return res.status(403).json({
        success: false,
        message: 'Payment deadline has passed. Payment is closed.',
      });
    }

    const student = await Student.findOne({ registrationNumber: normalized });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found. Please check your registration number and try again.',
      });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(409).json({
        success: false,
        message: 'Payment Already Completed ✓',
      });
    }

    const reference = generateReference(student.registrationNumber);
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: 'Flutterwave secret key is not configured on the server.',
      });
    }

    const response = await axios.post(
      `${FLUTTERWAVE_BASE_URL}/payments`,
      {
        tx_ref: reference,
        amount: Number(PICNIC_FEE),
        currency: 'NGN',
        redirect_url: `${FRONTEND_URL}/payment-success?reference=${reference}`,
        payment_options: 'card',
        customer: {
          email: buildCustomerEmail(student),
          name: student.name,
          phonenumber: '00000000000',
        },
        customizations: {
          title: 'SWE Final Year Picnic',
          description: 'Picnic fee payment',
          logo: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=200&q=80',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30000,
      }
    );

    const paymentLink = response?.data?.data?.link || response?.data?.data?.payment_link;
    if (!paymentLink) {
      return res.status(502).json({ success: false, message: 'Unable to initialize payment right now.' });
    }

    student.paymentStatus = 'pending';
    student.paymentReference = reference;
    await student.save();

    return res.status(200).json({
      success: true,
      authorization_url: paymentLink,
      reference,
    });
  } catch (error) {
    const flutterwaveError = error.response?.data;
    console.error('initializePayment error:', flutterwaveError || error.message);
    return res.status(500).json({
      success: false,
      message: 'Payment initialization failed. Please try again later.',
      details: flutterwaveError || null,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference is required.' });
    }

    const student = await Student.findOne({ paymentReference: reference });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Payment reference not found.',
      });
    }

    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    const tx = response?.data?.data || null;
    const paymentStatus = getPaymentStatusFromFlutterwave(tx);

    if (!tx || !['successful', 'success', 'completed'].includes(paymentStatus)) {
      return res.status(200).json({
        success: false,
        status: 'pending',
        message: 'Payment is still pending or not yet confirmed.',
      });
    }

    if (Number(tx.amount) !== PICNIC_FEE) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount does not match the configured picnic fee.',
      });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Payment already confirmed.',
        student: {
          name: student.name,
          registrationNumber: student.registrationNumber,
          amountPaid: student.amountPaid,
          paymentReference: student.paymentReference,
        },
      });
    }

    student.paymentStatus = 'paid';
    student.amountPaid = PICNIC_FEE;
    student.paidAt = new Date();
    await student.save();

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully.',
      student: {
        name: student.name,
        registrationNumber: student.registrationNumber,
        amountPaid: student.amountPaid,
        paymentReference: student.paymentReference,
      },
    });
  } catch (error) {
    console.error('verifyPayment error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed. Please try again later.',
    });
  }
};

const webhook = async (req, res) => {
  try {
    const signature = req.headers['verif-hash'] || req.headers['x-flutterwave-signature'];
    const payload = req.body;

    if (!signature) {
      return res.status(401).json({ success: false, message: 'Missing Flutterwave signature.' });
    }

    const validSignature = verifyFlutterwaveSignature(payload, signature);
    if (!validSignature) {
      return res.status(401).json({ success: false, message: 'Invalid Flutterwave signature.' });
    }

    const event = payload;
    const data = event?.data || {};
    const reference = data.tx_ref || data.reference || data.txRef;
    const eventName = event?.event;

    if (!data || !reference) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }

    const student = await Student.findOne({ paymentReference: reference });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Unknown transaction reference.' });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(200).json({ success: true, message: 'Duplicate webhook ignored.' });
    }

    const successfulEvents = ['charge.completed', 'charge.complete', 'transaction.successful', 'transaction.completed', 'payment.completed', 'payment.successful'];
    const isSuccessfulEvent = successfulEvents.includes(eventName);
    if (isSuccessfulEvent) {
      const txAmount = Number(data.amount || 0);
      if (txAmount !== PICNIC_FEE) {
        return res.status(400).json({ success: false, message: 'Incorrect payment amount.' });
      }

      student.paymentStatus = 'paid';
      student.amountPaid = PICNIC_FEE;
      student.paidAt = new Date();
      await student.save();

      return res.status(200).json({ success: true, message: 'Payment confirmed via webhook.' });
    }

    return res.status(200).json({ success: true, message: 'Webhook received but payment not successful.' });
  } catch (error) {
    console.error('webhook error:', error.message);
    return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  webhook,
  isDeadlinePassed,
};
