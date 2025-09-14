// routes/music.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const pool = require('../db');

// Ensure uploads/music directory exists
const UPLOAD_DIR = path.join(__dirname, '../uploads/music');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage for audio files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Helper: Run query
const runQuery = (sql, params) => new Promise((resolve, reject) => {
  pool.query(sql, params, (err, results) => {
    if (err) return reject(err);
    resolve(results);
  });
});

// 🎵 GET ALL MUSIC (Public) — YouTube + Uploaded Audio
router.get('/', async (req, res) => {
  try {
    // Get uploaded audio tracks
    const audioQuery = `
      SELECT 
        id,
        title,
        file_path,
        artist,
        genre,
        duration,
        plays,
        created_at as releaseDate
      FROM music 
      ORDER BY created_at DESC
    `;
    
    const audioRows = await runQuery(audioQuery, []);
    const audioTracks = audioRows.map(track => ({
      ...track,
      type: 'audio',
      src: `/uploads/music/${track.file_path}`,
      cover: '/placeholder-album.jpg' // You can upload cover images later
    }));
    
    res.json(audioTracks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🎵 UPLOAD AUDIO (Admin)
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, artist = 'Band Portal', genre = 'general' } = req.body;
    
    if (!title || !req.file) {
      return res.status(400).json({ message: 'Title and audio file are required' });
    }
    
    const filePath = req.file.filename;
    const duration = req.body.duration || 'Unknown'; // You can calculate this later
    
    const insertQuery = `
      INSERT INTO music (title, file_path, artist, genre, duration) 
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await runQuery(insertQuery, [title, filePath, artist, genre, duration]);
    
    res.status(201).json({
      id: result.insertId,
      title,
      file_path: filePath,
      artist,
      genre,
      duration,
      plays: 0,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    if (err.message.includes('audio files')) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// 🎵 UPDATE AUDIO (Admin)
router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, genre, duration } = req.body;
    
    // Get current track to handle file
    const selectQuery = `SELECT file_path FROM music WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Track not found' });
    }
    
    let filePath = rows[0].file_path;
    if (req.file) {
      // Delete old file
      const oldFilePath = path.join(UPLOAD_DIR, filePath);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      filePath = req.file.filename;
    }
    
    const updateFields = [];
    const values = [];
    
    if (title !== undefined) {
      updateFields.push('title = ?');
      values.push(title);
    }
    if (artist !== undefined) {
      updateFields.push('artist = ?');
      values.push(artist);
    }
    if (genre !== undefined) {
      updateFields.push('genre = ?');
      values.push(genre);
    }
    if (duration !== undefined) {
      updateFields.push('duration = ?');
      values.push(duration);
    }
    if (req.file) {
      updateFields.push('file_path = ?');
      values.push(filePath);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }
    
    values.push(id);
    const updateQuery = `
      UPDATE music 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    const result = await runQuery(updateQuery, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Track not found' });
    }
    
    res.json({ message: 'Track updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🎵 DELETE AUDIO (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get track to delete file
    const selectQuery = `SELECT file_path FROM music WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Track not found' });
    }
    
    // Delete file
    const filePath = path.join(UPLOAD_DIR, rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    const deleteQuery = `DELETE FROM music WHERE id = ?`;
    const result = await runQuery(deleteQuery, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Track not found' });
    }
    
    res.json({ message: 'Track deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🎵 INCREMENT PLAYS (Public)
router.patch('/:id/plays', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updateQuery = `
      UPDATE music 
      SET plays = plays + 1 
      WHERE id = ?
    `;
    
    const result = await runQuery(updateQuery, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Track not found' });
    }
    
    // Get updated plays count
    const selectQuery = `SELECT plays FROM music WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    
    res.json({ plays: rows[0].plays });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;