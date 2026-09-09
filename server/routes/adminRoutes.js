const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { getStats, getStudents, importStudentsFromCsv, exportPaymentsCsv } = require('../controllers/adminController');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  if (email === adminEmail && password === adminPassword) {
    const token = Buffer.from(`${adminEmail}:${adminPassword}`).toString('base64');
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
});

router.get('/stats', requireAdmin, getStats);
router.get('/students', requireAdmin, getStudents);
router.post('/import-csv', requireAdmin, importStudentsFromCsv);
router.get('/payments', requireAdmin, exportPaymentsCsv);

module.exports = router;
