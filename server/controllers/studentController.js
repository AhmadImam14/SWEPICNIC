const Student = require('../models/Student');

const normalizeRegistrationNumber = (input = '') => {
  const trimmed = String(input).trim();
  return trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

const buildRegistrationQueryPattern = (input = '') => {
  const cleaned = normalizeRegistrationNumber(input);
  return cleaned.split('').map((char) => `${char}[\\s/\\-]*`).join('');
};

const verifyStudent = async (req, res) => {
  try {
    const { registrationNumber } = req.body || {};

    if (!registrationNumber || !String(registrationNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Registration number is required.',
      });
    }

    const normalized = normalizeRegistrationNumber(registrationNumber);

    if (!normalized || normalized.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid registration number.',
      });
    }

    const student = await Student.findOne({
      $or: [
        { registrationNumber: normalized },
        { registrationNumber: { $regex: `^${buildRegistrationQueryPattern(normalized)}$`, $options: 'i' } },
      ],
    }).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found. Please check your registration number and try again.',
      });
    }

    if (student.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        alreadyPaid: true,
        message: 'Payment Already Completed ✓',
        student: {
          name: student.name,
          registrationNumber: student.registrationNumber,
          paymentStatus: student.paymentStatus,
          paymentReference: student.paymentReference || null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      alreadyPaid: false,
      student: {
        name: student.name,
        registrationNumber: student.registrationNumber,
        paymentStatus: student.paymentStatus,
      },
    });
  } catch (error) {
    console.error('verifyStudent error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify registration at the moment. Please try again later.',
    });
  }
};

module.exports = {
  verifyStudent,
  normalizeRegistrationNumber,
};
