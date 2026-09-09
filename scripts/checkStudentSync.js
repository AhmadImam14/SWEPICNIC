require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Student = require('../server/models/Student');

const normalizeRegistrationNumber = (input = '') => {
  return String(input).trim().replace(/\s+/g, '').toUpperCase();
};

const runCheck = async () => {
  const csvFilePath = path.join(__dirname, '../data/students.csv');

  if (!fs.existsSync(csvFilePath)) {
    console.error('CSV file not found at data/students.csv');
    process.exit(1);
  }

  const rowMap = new Map();
  const rows = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const reg = normalizeRegistrationNumber(row.registrationNumber);
        const name = String(row.name || '').trim();

        if (!reg || !name) return;

        rowMap.set(reg, name);
        rows.push(reg);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  await mongoose.connect(process.env.MONGODB_URI);

  const allStudents = await Student.find({}, 'registrationNumber name').lean();
  const dbSet = new Set(allStudents.map((s) => normalizeRegistrationNumber(s.registrationNumber)));

  const missingInDb = rows.filter((reg) => !dbSet.has(reg));
  const extraInDb = allStudents
    .map((s) => normalizeRegistrationNumber(s.registrationNumber))
    .filter((reg) => !rowMap.has(reg));

  console.log(`CSV rows: ${rows.length}`);
  console.log(`DB rows: ${allStudents.length}`);

  if (missingInDb.length > 0) {
    console.log(`Missing from MongoDB (${missingInDb.length}):`);
    console.log(missingInDb.slice(0, 10).join(', '));
  } else {
    console.log('All CSV students exist in MongoDB.');
  }

  if (extraInDb.length > 0) {
    console.log(`Extra in MongoDB (${extraInDb.length}):`);
    console.log(extraInDb.slice(0, 10).join(', '));
  }

  await mongoose.disconnect();
};

runCheck().catch((error) => {
  console.error('Student sync check failed:', error.message);
  process.exit(1);
});
