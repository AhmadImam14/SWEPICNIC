const crypto = require('crypto');
const Student = require('../models/Student');
const { generateReference } = require('../utils/generateReference');

const PICNIC_FEE = Number(process.env.PICNIC_FEE || 5000);
const PAYMENT_DEADLINE = process.env.PAYMENT_DEADLINE ? new Date(process.env.PAYMENT_DEADLINE) : null;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'quickteller').toLowerCase();
const QUICKTELLER_CHECKOUT_URL = (process.env.QUICKTELLER_CHECKOUT_URL || 'https://checkout.quickteller.com').replace(/\/$/, '');
const QUICKTELLER_MERCHANT_ID = process.env.QUICKTELLER_MERCHANT_ID || '';
const QUICKTELLER_API_KEY = process.env.QUICKTELLER_API_KEY || '';

const buildCustomerEmail = (student) => {
  const regNumber = String(student?.registrationNumber || '').trim().toLowerCase();
  const cleanedLocalPart = regNumber.replace(/[^a-z0-9]/g, '').slice(0, 60) || 'student';
  return `${cleanedLocalPart}@student.mail`;
};

const isDeadlinePassed = () => {
  if (!PAYMENT_DEADLINE || Number.isNaN(PAYMENT_DEADLINE.getTime())) {
    return false;
  }

  return new Date() >= PAYMENT_DEADLINE;
};

const buildQuicktellerCheckoutUrl = (student, reference) => {
  const params = new URLSearchParams({
    merchantId: QUICKTELLER_MERCHANT_ID,
    amount: String(PICNIC_FEE),
    reference,
    redirectUrl: `${FRONTEND_URL}/payment-success?reference=${reference}`,
    customerName: student.name,
    customerEmail: buildCustomerEmail(student),
    description: 'SWE Final Year Picnic',
  });

  return `${QUICKTELLER_CHECKOUT_URL}?${params.toString()}`;
};

const verifyQuicktellerSignature = (payload, signature) => {
  const secretHash = process.env.QUICKTELLER_WEBHOOK_HASH || QUICKTELLER_API_KEY || '';
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

    if (PAYMENT_PROVIDER !== 'quickteller') {
      return res.status(500).json({
        success: false,
        message: 'Unsupported payment provider configured.',
      });
    }

    if (!QUICKTELLER_MERCHANT_ID) {
      return res.status(500).json({
        success: false,
        message: 'Quickteller merchant ID is not configured on the server.',
      });
    }

    const reference = generateReference(student.registrationNumber);
    const authorizationUrl = buildQuicktellerCheckoutUrl(student, reference);

    student.paymentStatus = 'pending';
    student.paymentReference = reference;
    await student.save();

    return res.status(200).json({
      success: true,
      authorization_url: authorizationUrl,
      reference,
      provider: 'quickteller',
    });
  } catch (error) {
    console.error('initializePayment error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Payment initialization failed. Please try again later.',
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

    return res.status(200).json({
      success: false,
      status: 'pending',
      message: 'Quickteller payment is pending confirmation.',
    });
  } catch (error) {
    console.error('verifyPayment error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed. Please try again later.',
    });
  }
};

const webhook = async (req, res) => {
  try {
    const signature = req.headers['x-quickteller-signature'] || req.headers['verif-hash'];
    const payload = req.body;

    if (signature) {
      const validSignature = verifyQuicktellerSignature(payload, signature);
      if (!validSignature) {
        return res.status(401).json({ success: false, message: 'Invalid Quickteller signature.' });
      }
    }

    const data = payload?.data || payload || {};
    const reference = data.tx_ref || data.reference || data.txRef || data.transactionReference || data.paymentReference;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }

    const student = await Student.findOne({ paymentReference: reference });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Unknown transaction reference.' });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(200).json({ success: true, message: 'Duplicate webhook ignored.' });
    }

    const amount = Number(data.amount || data.totalAmount || PICNIC_FEE || 0);
    if (amount !== PICNIC_FEE) {
      return res.status(400).json({ success: false, message: 'Incorrect payment amount.' });
    }

    student.paymentStatus = 'paid';
    student.amountPaid = PICNIC_FEE;
    student.paidAt = new Date();
    await student.save();

    return res.status(200).json({ success: true, message: 'Payment confirmed via webhook.' });
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
