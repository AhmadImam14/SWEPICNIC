const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Basic ') ? authHeader.slice(6) : '';

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const expected = Buffer.from(
    `${process.env.ADMIN_EMAIL || ''}:${process.env.ADMIN_PASSWORD || ''}`
  ).toString('base64');

  if (token !== expected) {
    return res.status(401).json({ message: 'Invalid admin credentials' });
  }

  next();
};

module.exports = { requireAdmin };
