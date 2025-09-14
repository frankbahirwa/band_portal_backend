// middleware/auth.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const requireAdmin = (req, res, next) => {
  try {
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { id, username, email }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { requireAdmin };
