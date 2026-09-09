require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Student = require('../server/models/Student');

const normalizeRegistrationNumber = (input = '') => {
  return String(input).trim().replace(/\s+/g, '').toUpperCase();
};

const importStudents = async () => {
  const csvFilePath = path.join(__dirname, '../data/students.csv');

  if (!fs.existsSync(csvFilePath)) {
    throw new Error('CSV file not found at data/students.csv');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const rows = await new Promise((resolve, reject) => {
    const collected = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        collected.push({
          name: String(row.name || '').trim(),
          registrationNumber: normalizeRegistrationNumber(row.registrationNumber),
        });
      })
      .on('end', () => resolve(collected))
      .on('error', reject);
  });

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.name || !row.registrationNumber) {
      skipped += 1;
      continue;
    }

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

  const summary = `Imported ${created} students. Skipped ${skipped} duplicates/invalid rows.`;
  await mongoose.disconnect();
  return { created, skipped, summary };
};

if (require.main === module) {
  importStudents()
    .then((result) => {
      console.log(result.summary);
      process.exit(0);
    })
    .catch((error) => {
      console.error('CSV import error:', error.message);
      process.exit(1);
    });
}

module.exports = {
  importStudents,
  normalizeRegistrationNumber,
};
