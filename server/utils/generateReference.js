const crypto = require('crypto');

const generateReference = (registrationNumber = '') => {
  const safeReg = String(registrationNumber).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'STUDENT';
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SWEPICNIC-${safeReg}-${randomPart}`;
};

module.exports = { generateReference };
