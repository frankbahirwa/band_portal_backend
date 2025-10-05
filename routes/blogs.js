// routes/blogs.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = require("../db");
// Comments now in MySQL

// ======================
// Multer setup
// ======================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../uploads/blogs");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});
const upload = multer({ storage });

// ======================
// Routes
// ======================

// GET all blogs from MySQL
router.get("/", (req, res) => {
  // Get all blogs and their comment counts
  db.query(
    `SELECT b.*, COUNT(c.id) AS commentCount
     FROM blogs b
     LEFT JOIN blog_comments c ON b.id = c.blogId
     GROUP BY b.id
     ORDER BY b.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      // For frontend compatibility, add comments: [] property with length = commentCount
      const blogsWithCommentCount = results.map(blog => ({
        ...blog,
        comments: Array(blog.commentCount).fill({}) // dummy array for length
      }));
      res.json(blogsWithCommentCount);
    }
  );
});

// GET single blog by ID from MySQL, including comments
router.get("/:id", (req, res) => {
  db.query("SELECT * FROM blogs WHERE id = ?", [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (results.length === 0) return res.status(404).json({ message: "Blog not found" });
    const blog = results[0];
    db.query("SELECT * FROM blog_comments WHERE blogId = ? ORDER BY created_at ASC", [blog.id], (err2, comments) => {
      if (err2) return res.status(500).json({ message: "Database error", error: err2 });
      res.json({ blog, comments });
    });
  });
});

// POST create blog in MySQL
router.post("/", upload.single("image"), (req, res) => {
  const { title, content, category } = req.body;
  const image_url = req.file ? req.file.filename : null;
  const id = Date.now().toString();
  const newBlog = {
    id,
    title,
    content,
    category: category || "general",
    image_url,
    likes: 0,
    created_at: new Date(),
  };
  db.query(
    "INSERT INTO blogs (id, title, content, category, image_url, likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      newBlog.id,
      newBlog.title,
      newBlog.content,
      newBlog.category,
      newBlog.image_url,
      newBlog.likes,
      newBlog.created_at,
    ],
    (err) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      res.status(201).json(newBlog);
    }
  );
});

// PUT update blog in MySQL
router.put("/:id", upload.single("image"), (req, res) => {
  const { title, content, category } = req.body;
  const image_url = req.file ? req.file.filename : null;
  const fields = [];
  const values = [];
  if (title) { fields.push("title = ?"); values.push(title); }
  if (content) { fields.push("content = ?"); values.push(content); }
  if (category) { fields.push("category = ?"); values.push(category); }
  if (image_url) { fields.push("image_url = ?"); values.push(image_url); }
  if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });
  values.push(req.params.id);
  db.query(
    `UPDATE blogs SET ${fields.join(", ")} WHERE id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Blog not found" });
      res.json({ message: "Blog updated successfully" });
    }
  );
});

// DELETE blog from MySQL
router.delete("/:id", (req, res) => {
  db.query("DELETE FROM blogs WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Blog not found" });
    res.json({ message: "Blog deleted successfully" });
  });
});

// POST like blog in MySQL
router.post("/:id/like", (req, res) => {
  db.query(
    "UPDATE blogs SET likes = likes + 1 WHERE id = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Blog not found" });
      db.query("SELECT likes FROM blogs WHERE id = ?", [req.params.id], (err2, results) => {
        if (err2) return res.status(500).json({ message: "Database error", error: err2 });
        res.json({ likes: results[0]?.likes ?? null });
      });
    }
  );
});

// POST comment on blog (save to MySQL)
router.post("/:id/comments", (req, res) => {
  const blogId = req.params.id;
  const { name, comment } = req.body;
  const id = Date.now().toString();
  db.query("SELECT * FROM blogs WHERE id = ?", [blogId], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (results.length === 0) return res.status(404).json({ message: "Blog not found" });
    db.query(
      "INSERT INTO blog_comments (id, blogId, name, comment, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, blogId, name, comment, new Date()],
      (err2) => {
        if (err2) return res.status(500).json({ message: "Database error", error: err2 });
        res.status(201).json({ id, blogId, name, comment, created_at: new Date() });
      }
    );
  });
});

module.exports = router;
