// routes/contactMessages.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const pool = require('../db');

const runQuery = (sql, params) => new Promise((resolve, reject) => {
  pool.query(sql, params, (err, results) => {
    if (err) return reject(err);
    resolve(results);
  });
});

// 👤 POST /contact-messages — PUBLIC
router.post('/', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('message').notEmpty().withMessage('Message is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, message } = req.body;

  try {
    await runQuery(
      'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)',
      [name, email, message]
    );
    res.status(201).json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 👨‍💼 GET /contact-messages — ADMIN ONLY
router.get('/', requireAdmin, async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC',
      []
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🗑️ DELETE /contact-messages/:id — ADMIN ONLY
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await runQuery(
      'DELETE FROM contact_messages WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;