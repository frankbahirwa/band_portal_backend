// routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config();

// =============================
// 📂 Multer setup
// =============================
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const musicDir = path.join(uploadDir, 'music');
const photosDir = path.join(uploadDir, 'photos');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

const musicStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, musicDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});

const musicUpload = multer({ storage: musicStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const photoUpload = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// =============================
// 🔧 Helper: run query
// =============================
const runQuery = (sql, params) => new Promise((resolve, reject) => {
  pool.query(sql, params, (err, results) => {
    if (err) return reject(err);
    resolve(results);
  });
});

// =============================
// 👤 Admin register (hash password)
// =============================
router.post('/register', [
  body('username').isString().notEmpty(),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email, password } = req.body;

    // check if user already exists
    const existing = await runQuery('SELECT id FROM admin WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) return res.status(400).json({ message: 'Admin already exists' });

    // ✅ hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    await runQuery(
      'INSERT INTO admin (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    return res.json({ message: 'Admin created successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// =============================
// 🔑 Admin login
// =============================
// Supports both email + username
router.post('/login', [
  body('identifier').isString().notEmpty(),
  body('password').isString().notEmpty()
], async (req, res) => {
  try {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    const { identifier, password } = req.body;

    // detect if email or username
    const queryField = identifier.includes('@') ? 'email' : 'username';
    const rows = await runQuery(`SELECT * FROM admin WHERE ${queryField} = ?`, [identifier]);
    if (!rows || rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXP || '2h' }
    );

    // set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000
    });

    // 🔑 send token back in JSON for frontend
    return res.json({ message: 'Logged in', token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

const { requireAdmin } = require('../middleware/auth');

// =============================
// 🚪 Logout
// =============================
router.post('/logout', requireAdmin, (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out' });
});

// =============================
// 🎵 Upload music
// =============================
router.post('/upload/music', requireAdmin, musicUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const title = req.body.title || req.file.originalname;
    const filePath = '/uploads/music/' + path.basename(req.file.path);
    const q = 'INSERT INTO music (title, file_path) VALUES (?, ?)';
    await runQuery(q, [title, filePath]);
    return res.json({ message: 'Music uploaded', filePath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// =============================
// 🖼️ Upload photo
// =============================
router.post('/upload/photo', requireAdmin, photoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const caption = req.body.caption || null;
    const filePath = '/uploads/photos/' + path.basename(req.file.path);
    const q = 'INSERT INTO photos (file_path, caption) VALUES (?, ?)';
    await runQuery(q, [filePath, caption]);
    return res.json({ message: 'Photo uploaded', filePath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// =============================
// 📝 Create blog
// =============================
router.post('/blogs', requireAdmin, [
  body('title').isString().notEmpty(),
  body('content').isString().notEmpty()
], async (req, res) => {
  try {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    const { title, content } = req.body;
    await runQuery('INSERT INTO blogs (title, content) VALUES (?, ?)', [title, content]);
    return res.json({ message: 'Blog created' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// =============================
// 🏷️ Edit about
// =============================
router.put('/about', requireAdmin, [body('content').isString().notEmpty()], async (req, res) => {
  try {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    const { content } = req.body;
    const rows = await runQuery('SELECT COUNT(*) as c FROM about', []);
    if (rows[0].c === 0) {
      await runQuery('INSERT INTO about (content) VALUES (?)', [content]);
    } else {
      await runQuery('UPDATE about SET content = ? WHERE id = (SELECT id FROM (SELECT id FROM about LIMIT 1) tmp)', [content]);
    }
    return res.json({ message: 'About updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// =============================
// ☎️ Edit contact
// =============================
router.put('/contact', requireAdmin, [
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('address').optional().isString()
], async (req, res) => {
  try {
    const { email, phone, address } = req.body;
    const rows = await runQuery('SELECT COUNT(*) as c FROM contact', []);
    if (rows[0].c === 0) {
      await runQuery('INSERT INTO contact (email, phone, address) VALUES (?, ?, ?)', [email || null, phone || null, address || null]);
    } else {
      await runQuery('UPDATE contact SET email = ?, phone = ?, address = ? WHERE id = (SELECT id FROM (SELECT id FROM contact LIMIT 1) tmp)', [email || null, phone || null, address || null]);
    }
    return res.json({ message: 'Contact updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/contact-messages
router.get('/contact-messages', async (req, res) => { // ← removed requireAdmin
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

// DELETE /api/contact-message/:id
router.delete('/contact-message/:id', requireAdmin, async (req, res) => {
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

// =============================
// 💰 Donations
// =============================
// View donations
router.get('/donations', requireAdmin, async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM donations ORDER BY created_at DESC', []);
    return res.json({ donations: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update donation status
router.put('/donations/:id/status', requireAdmin, [
  body('status').isIn(['pending', 'confirmed', 'failed'])
], async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    await runQuery('UPDATE donations SET status = ? WHERE id = ?', [status, id]);
    return res.json({ message: 'Status updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
