require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Student = require('../server/models/Student');

const normalizeRegistrationNumber = (input = '') => {
  return String(input).trim().replace(/\s+/g, '').toUpperCase();
};

const resetPaidStudents = async () => {
  const before = await Student.countDocuments({ paymentStatus: 'paid' });
  console.log('PAID_BEFORE', before);

  const result = await Student.updateMany(
    { paymentStatus: 'paid' },
    { $set: { paymentStatus: 'unpaid', amountPaid: 0, paidAt: null, paymentReference: null } }
  );

  const after = await Student.countDocuments({ paymentStatus: 'paid' });
  console.log('PAID_AFTER_RESET', after);
  console.log('MATCHED_DOCS_RESET', result.matchedCount || 0);
};

const importStudents = async () => {
  const csvFilePath = path.join(__dirname, '../data/students.csv');

  if (!fs.existsSync(csvFilePath)) {
    throw new Error('CSV file not found at data/students.csv');
  }

  const rows = await new Promise((resolve, reject) => {
    const collected = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const name = String(row.name || '').trim();
        const registrationNumber = normalizeRegistrationNumber(row.registrationNumber);
        if (name && registrationNumber) {
          collected.push({ name, registrationNumber });
        }
      })
      .on('end', () => resolve(collected))
      .on('error', reject);
  });

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await Student.findOne({ registrationNumber: row.registrationNumber });
    if (existing) {
      skipped += 1;
      continue;
    }

    await Student.create({
      name: row.name,
      registrationNumber: row.registrationNumber,
      paymentStatus: 'unpaid',
    });

    created += 1;
  }

  return { created, skipped };
};

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing in the environment');
  }

  await mongoose.connect(uri);
  console.log('CONNECTED_TO_DB', 'ok');

  await resetPaidStudents();

  const importResult = await importStudents();
  console.log('IMPORT_CREATED', importResult.created);
  console.log('IMPORT_SKIPPED', importResult.skipped);

  const finalPaid = await Student.countDocuments({ paymentStatus: 'paid' });
  console.log('PAID_FINAL', finalPaid);

  await mongoose.disconnect();
})().catch((error) => {
  console.error('RESET_AND_IMPORT_ERROR', error.message);
  process.exit(1);
});
