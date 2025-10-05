const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const db = require("../db");
const { promisify } = require('util');

// Convert db.query to promise
const query = promisify(db.query).bind(db);

// Multer setup
const blogDir = path.join(__dirname, "../uploads/blogs");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, blogDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ==================
// Get all blogs
// ==================
router.get("/", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM blogs ORDER BY created_at DESC");
    const blogs = rows.map((b) => ({
      ...b,
      image_url: b.image_url ? b.image_url : null,
    }));

    res.json({ data: blogs });
  } catch (err) {
    console.error("Error fetching blogs:", err);
    res.status(500).json({ message: "Failed to fetch blogs" });
  }
});

// ==================
// Get single blog
// ==================
router.get("/:id", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM blogs WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Blog not found" });
    const blog = rows[0];
    
    // Get comments for this blog
    const commentRows = await query(
      "SELECT * FROM blog_comments WHERE blog_id = ? ORDER BY created_at DESC", 
      [req.params.id]
    );
    
    res.json({
      data: {
        blog: {
          ...blog,
          image_url: blog.image_url ? blog.image_url : null
        },
        comments: commentRows || []
      }
    });
  } catch (err) {
    console.error("Error fetching blog:", err);
    res.status(500).json({ message: "Failed to fetch blog" });
  }
});

// ==================
// Create blog
// ==================
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) return res.status(400).json({ message: "Title and content required" });

    const result = await query(
      "INSERT INTO blogs (title, content, category, image_url, likes, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NOW(), NOW())",
      [title, content, category || "general", req.file ? req.file.filename : null]
    );

    const newBlog = {
      id: result.insertId,
      title,
      content,
      category: category || "general",
      image_url: req.file ? req.file.filename : null,
      likes: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    res.status(201).json({ data: newBlog });
  } catch (err) {
    console.error("Error creating blog:", err);
    res.status(500).json({ message: "Failed to create blog" });
  }
});

// ==================
// Update blog
// ==================
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, content, category } = req.body;
    const rows = await query("SELECT * FROM blogs WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Blog not found" });

    const blog = rows[0];
    const imageFile = req.file ? req.file.filename : blog.image_url;

    await query(
      "UPDATE blogs SET title = ?, content = ?, category = ?, image_url = ?, updated_at = NOW() WHERE id = ?",
      [title || blog.title, content || blog.content, category || blog.category, imageFile, req.params.id]
    );

    const updatedBlog = {
      id: blog.id,
      title: title || blog.title,
      content: content || blog.content,
      category: category || blog.category,
      image_url: imageFile || null,
      likes: blog.likes,
      created_at: blog.created_at,
      updated_at: new Date(),
    };

    res.json({ data: updatedBlog });
  } catch (err) {
    console.error("Error updating blog:", err);
    res.status(500).json({ message: "Failed to update blog" });
  }
});

// ==================
// Delete blog
// ==================
router.delete("/:id", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM blogs WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Blog not found" });

    await query("DELETE FROM blogs WHERE id = ?", [req.params.id]);
    res.json({ message: "Blog deleted" });
  } catch (err) {
    console.error("Error deleting blog:", err);
    res.status(500).json({ message: "Failed to delete blog" });
  }
});

// ==================
// Like a blog
// ==================
router.post("/:id/like", async (req, res) => {
  try {
    const rows = await query("SELECT likes FROM blogs WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Blog not found" });
    
    const newLikes = (rows[0].likes || 0) + 1;
    await query("UPDATE blogs SET likes = ? WHERE id = ?", [newLikes, req.params.id]);
    
    res.json({ data: { likes: newLikes } });
  } catch (err) {
    console.error("Error liking blog:", err);
    res.status(500).json({ message: "Failed to like blog" });
  }
});

// ==================
// Post comment
// ==================
router.post("/:id/comments", async (req, res) => {
  try {
    const { name, comment } = req.body;
    if (!name || !comment) return res.status(400).json({ message: "Name and comment required" });
    
    const result = await query(
      "INSERT INTO blog_comments (blog_id, name, comment, created_at) VALUES (?, ?, ?, NOW())",
      [req.params.id, name, comment]
    );
    
    const newComment = {
      id: result.insertId,
      blog_id: req.params.id,
      name,
      comment,
      created_at: new Date()
    };
    
    res.status(201).json({ data: newComment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ message: "Failed to post comment" });
  }
});

module.exports = router;