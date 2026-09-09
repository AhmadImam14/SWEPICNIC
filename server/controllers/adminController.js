const Student = require('../models/Student');
const { importStudents } = require('../../scripts/importStudents');

const getStats = async (req, res) => {
  try {
    const [totalStudents, paidCount, pendingCount, unpaidCount, totalCollected] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ paymentStatus: 'paid' }),
      Student.countDocuments({ paymentStatus: 'pending' }),
      Student.countDocuments({ paymentStatus: 'unpaid' }),
      Student.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalStudents,
        paid: paidCount,
        pending: pendingCount,
        unpaid: unpaidCount,
        totalCollected: totalCollected[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('getStats error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load admin stats.' });
  }
};

const getStudents = async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const query = {};

    if (search) {
      const searchValue = search.trim();
      query.$or = [
        { registrationNumber: { $regex: searchValue, $options: 'i' } },
        { name: { $regex: searchValue, $options: 'i' } },
      ];
    }

    if (status) {
      query.paymentStatus = status;
    }

    const students = await Student.find(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, students });
  } catch (error) {
    console.error('getStudents error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load students.' });
  }
};

const importStudentsFromCsv = async (req, res) => {
  try {
    const result = await importStudents();
    return res.status(200).json({
      success: true,
      message: result.summary,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error('importStudentsFromCsv error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to import student CSV.',
    });
  }
};

const exportPaymentsCsv = async (req, res) => {
  try {
    const students = await Student.find({ paymentStatus: 'paid' }).sort({ paidAt: 1 }).lean();

    const headers = ['Registration No', 'Name', 'Status', 'Amount', 'Reference', 'Date'];
    const rows = students.map((student) => [
      student.registrationNumber,
      student.name,
      student.paymentStatus,
      student.amountPaid,
      student.paymentReference || '',
      student.paidAt ? new Date(student.paidAt).toISOString() : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="picnic-payments.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('exportPaymentsCsv error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to export payment records.' });
  }
};

module.exports = {
  getStats,
  getStudents,
  importStudentsFromCsv,
  exportPaymentsCsv,
};
