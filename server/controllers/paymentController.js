const crypto = require('crypto');
const Student = require('../models/Student');
const { generateReference } = require('../utils/generateReference');

const PICNIC_FEE = Number(process.env.PICNIC_FEE || 5000);
const PAYMENT_DEADLINE = process.env.PAYMENT_DEADLINE ? new Date(process.env.PAYMENT_DEADLINE) : null;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase();
const PAYSTACK_API_URL = (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, '');
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_CALLBACK_URL = (process.env.PAYSTACK_CALLBACK_URL || `${FRONTEND_URL}/payment-success`).replace(/\/$/, '');

const buildCustomerEmail = (student) => {
  const rawIdentifier = String(student?.registrationNumber || student?.name || '').trim();
  const cleanedLocalPart = rawIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);

  const safeLocalPart = cleanedLocalPart && cleanedLocalPart.length >= 3 ? cleanedLocalPart : 'student';
  return `${safeLocalPart}@swepicnic.com`;
};

const buildSuccessCallbackUrl = (reference) => {
  const baseUrl = PAYSTACK_CALLBACK_URL || `${FRONTEND_URL}/payment-success`;
  const hasQuery = baseUrl.includes('?');
  return `${baseUrl}${hasQuery ? '&' : '?'}reference=${encodeURIComponent(reference)}`;
};

const isDeadlinePassed = () => {
  if (!PAYMENT_DEADLINE || Number.isNaN(PAYMENT_DEADLINE.getTime())) {
    return false;
  }

  return new Date() >= PAYMENT_DEADLINE;
};

const paystackRequest = async (path, body = {}, method = 'POST') => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured on the server.');
  }

  const requestOptions = {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (method !== 'GET' && Object.keys(body).length > 0) {
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${PAYSTACK_API_URL}${path}`, requestOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.status === false) {
    throw new Error(payload?.message || 'Paystack request failed.');
  }

  return payload;
};

const verifyPaystackSignature = (payload, signature) => {
  if (!PAYSTACK_SECRET_KEY || !signature) return false;

  const expectedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(payload).digest('hex');
  if (expectedHash.length !== signature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(signature));
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

    if (PAYMENT_PROVIDER !== 'paystack') {
      return res.status(500).json({
        success: false,
        message: 'Unsupported payment provider configured.',
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Paystack secret key is not configured on the server.',
      });
    }

    const reference = generateReference(student.registrationNumber);
    const payload = {
      email: buildCustomerEmail(student),
      amount: String(Math.round(PICNIC_FEE * 100)),
      reference,
      callback_url: buildSuccessCallbackUrl(reference),
    };

    const response = await paystackRequest('/transaction/initialize', payload, 'POST');
    const authorizationUrl = response?.data?.authorization_url;

    if (!authorizationUrl) {
      throw new Error('Paystack did not return an authorization URL.');
    }

    student.paymentStatus = 'pending';
    student.paymentReference = reference;
    await student.save();

    return res.status(200).json({
      success: true,
      authorization_url: authorizationUrl,
      reference,
      provider: 'paystack',
    });
  } catch (error) {
    console.error('initializePayment error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Payment initialization failed. Please try again later.',
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

    const response = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, {}, 'GET');
    const payment = response?.data || {};
    const amountMatches = Number(payment.amount || 0) === Math.round(PICNIC_FEE * 100);

    if (payment.status === 'success' && amountMatches) {
      student.paymentStatus = 'paid';
      student.amountPaid = PICNIC_FEE;
      student.paidAt = new Date();
      await student.save();

      return res.status(200).json({
        success: true,
        message: 'Payment confirmed via Paystack.',
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
      message: 'Paystack payment is pending confirmation.',
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
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
    const signature = req.headers['x-paystack-signature'];

    if (signature && !verifyPaystackSignature(rawBody, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid Paystack signature.' });
    }

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body || {};
    const event = payload?.event || 'charge.success';
    const data = payload?.data || {};
    const reference = data.reference || data.tx_ref;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }

    if (event !== 'charge.success' || data.status !== 'success') {
      return res.status(200).json({ success: true, message: 'Webhook received but transaction not successful.' });
    }

    const student = await Student.findOne({ paymentReference: reference });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Unknown transaction reference.' });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(200).json({ success: true, message: 'Duplicate webhook ignored.' });
    }

    const amount = Number(data.amount || 0);
    if (amount !== Math.round(PICNIC_FEE * 100)) {
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
