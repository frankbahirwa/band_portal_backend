// routes/blogs.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const pool = require('../db');

// Ensure uploads/blogs directory exists
const UPLOAD_DIR = path.join(__dirname, '../uploads/blogs');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage for blog images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
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

// 📝 GET ALL BLOGS (Public)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        b.id,
        b.title,
        b.content,
        b.image_url,
        b.category,
        b.likes,
        b.created_at as date,
        COUNT(c.id) as comments
      FROM blogs b
      LEFT JOIN blog_comments c ON b.id = c.blog_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `;
    
    const rows = await runQuery(query, []);
    const blogs = rows.map(blog => ({
      ...blog,
      src: blog.image_url ? `/uploads/blogs/${blog.image_url}` : null,
      author: "Band Portal",
      readTime: calculateReadTime(blog.content)
    }));
    
    res.json(blogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 📝 GET BLOG BY ID (Public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        b.id,
        b.title,
        b.content,
        b.image_url,
        b.category,
        b.likes,
        b.created_at as date
      FROM blogs b
      WHERE b.id = ?
    `;
    
    const rows = await runQuery(query, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    const blog = {
      ...rows[0],
      src: rows[0].image_url ? `/uploads/blogs/${rows[0].image_url}` : null,
      author: "Band Portal",
      readTime: calculateReadTime(rows[0].content)
    };
    
    // Get comments for this blog
    const commentsQuery = `
      SELECT id, name, comment, created_at 
      FROM blog_comments 
      WHERE blog_id = ? 
      ORDER BY created_at DESC
    `;
    const comments = await runQuery(commentsQuery, [id]);
    
    res.json({ blog, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❤️ LIKE BLOG (Public)
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update likes count
    const updateQuery = `
      UPDATE blogs 
      SET likes = likes + 1 
      WHERE id = ?
    `;
    
    const result = await runQuery(updateQuery, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Get updated likes count
    const selectQuery = `SELECT likes FROM blogs WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    
    res.json({ likes: rows[0].likes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 💬 POST COMMENT (Public)
router.post('/:id/comments', [
  // Validation middleware could be added here
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, comment } = req.body;
    
    if (!name || !comment) {
      return res.status(400).json({ message: 'Name and comment are required' });
    }
    
    // Insert comment
    const insertQuery = `
      INSERT INTO blog_comments (blog_id, name, comment) 
      VALUES (?, ?, ?)
    `;
    
    await runQuery(insertQuery, [id, name, comment]);
    
    // Get the new comment with formatted date
    const selectQuery = `
      SELECT id, name, comment, created_at 
      FROM blog_comments 
      WHERE blog_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const rows = await runQuery(selectQuery, [id]);
    
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 👨‍💼 ADMIN: CREATE BLOG
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, content, category = 'general' } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    
    let imageUrl = null;
    if (req.file) {
      imageUrl = req.file.filename;
    }
    
    const insertQuery = `
      INSERT INTO blogs (title, content, image_url, category) 
      VALUES (?, ?, ?, ?)
    `;
    
    const result = await runQuery(insertQuery, [title, content, imageUrl, category]);
    
    res.status(201).json({
      id: result.insertId,
      title,
      content,
      image_url: imageUrl,
      category,
      likes: 0,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 👨‍💼 ADMIN: UPDATE BLOG
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;
    
    // Get current blog to handle image
    const selectQuery = `SELECT image_url FROM blogs WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    let imageUrl = rows[0].image_url;
    if (req.file) {
      // Delete old image if exists
      if (imageUrl) {
        const oldImagePath = path.join(UPLOAD_DIR, imageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imageUrl = req.file.filename;
    }
    
    const updateFields = [];
    const values = [];
    
    if (title !== undefined) {
      updateFields.push('title = ?');
      values.push(title);
    }
    if (content !== undefined) {
      updateFields.push('content = ?');
      values.push(content);
    }
    if (category !== undefined) {
      updateFields.push('category = ?');
      values.push(category);
    }
    if (imageUrl !== undefined) {
      updateFields.push('image_url = ?');
      values.push(imageUrl);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }
    
    values.push(id);
    const updateQuery = `
      UPDATE blogs 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    const result = await runQuery(updateQuery, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    res.json({ message: 'Blog updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 👨‍💼 ADMIN: DELETE BLOG
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get blog to delete image
    const selectQuery = `SELECT image_url FROM blogs WHERE id = ?`;
    const rows = await runQuery(selectQuery, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Delete image file if exists
    if (rows[0].image_url) {
      const imagePath = path.join(UPLOAD_DIR, rows[0].image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Delete blog (comments will be deleted via CASCADE)
    const deleteQuery = `DELETE FROM blogs WHERE id = ?`;
    const result = await runQuery(deleteQuery, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to calculate read time
function calculateReadTime(content) {
  const wordsPerMinute = 200;
  const words = content.split(' ').length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return `${minutes} min`;
}

module.exports = router;