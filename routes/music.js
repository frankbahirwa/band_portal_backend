// routes/music.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const router = express.Router();

// =========================
// Multer setup for file uploads
// =========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.fieldname + "-" + Date.now() + ext;
    cb(null, name);
  },
});

const upload = multer({ storage });

// =========================
// In-memory "DB"
// =========================
// No more in-memory tracks; use MySQL

// =========================
// GET all tracks
// =========================
// GET all tracks from MySQL
router.get("/", (req, res) => {
  db.query("SELECT * FROM music ORDER BY created_at DESC", (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    const baseUrl = `${req.protocol}://${req.get("host")}/uploads`;
    const formattedTracks = results.map(track => ({
      ...track,
      src: track.src && typeof track.src === "string"
        ? (track.src.startsWith("http") ? track.src : `${baseUrl}/${track.src}`)
        : null,
      cover: track.cover && typeof track.cover === "string"
        ? (track.cover.startsWith("http") ? track.cover : `${baseUrl}/${track.cover}`)
        : null,
    }));
    res.json(formattedTracks);
  });
});

// =========================
// POST a new track
// =========================
// POST a new track to MySQL
router.post("/", upload.fields([{ name: "file" }, { name: "cover" }]), (req, res) => {
  const { title, artist, genre, type, description } = req.body;
  const file = req.files["file"]?.[0];
  const cover = req.files["cover"]?.[0];

  if (!file) return res.status(400).json({ message: "Audio or video file is required" });

  const id = Date.now().toString();
  const newTrack = {
    id,
    title,
    artist,
    genre,
    type: type || (file.mimetype.startsWith("video") ? "video" : "audio"),
    description,
    src: file.filename,
    cover: cover?.filename || null,
    likes: 0,
    plays: 0,
    created_at: new Date(),
  };

  db.query(
    "INSERT INTO music (id, title, artist, genre, type, description, src, cover, likes, plays, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      newTrack.id,
      newTrack.title,
      newTrack.artist,
      newTrack.genre,
      newTrack.type,
      newTrack.description,
      newTrack.src,
      newTrack.cover,
      newTrack.likes,
      newTrack.plays,
      newTrack.created_at,
    ],
    (err) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      res.status(201).json({ message: "Track uploaded successfully", track: newTrack });
    }
  );
});

// =========================
// PUT update a track
// =========================
router.put("/:id", upload.fields([{ name: "file" }, { name: "cover" }]), (req, res) => {
  const { id } = req.params;
  const { title, artist, genre, type, description } = req.body;
  const file = req.files["file"]?.[0];
  const cover = req.files["cover"]?.[0];

  // Build update fields
  const fields = [];
  const values = [];
  if (title) { fields.push("title = ?"); values.push(title); }
  if (artist) { fields.push("artist = ?"); values.push(artist); }
  if (genre) { fields.push("genre = ?"); values.push(genre); }
  if (type) { fields.push("type = ?"); values.push(type); }
  if (description) { fields.push("description = ?"); values.push(description); }
  if (file) { fields.push("src = ?"); values.push(file.filename); }
  if (cover) { fields.push("cover = ?"); values.push(cover.filename); }

  if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });

  values.push(id);
  db.query(
    `UPDATE music SET ${fields.join(", ")} WHERE id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Track not found" });
      res.json({ message: "Track updated successfully" });
    }
  );
});

// =========================
// DELETE a track
// =========================
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  // Optionally, fetch track first to remove files
  db.query("SELECT src, cover FROM music WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (results.length === 0) return res.status(404).json({ message: "Track not found" });
    const track = results[0];
    if (track.src) fs.unlink(path.join(__dirname, "../uploads", track.src), () => {});
    if (track.cover) fs.unlink(path.join(__dirname, "../uploads", track.cover), () => {});
    db.query("DELETE FROM music WHERE id = ?", [id], (err2, result) => {
      if (err2) return res.status(500).json({ message: "Database error", error: err2 });
      res.json({ message: "Track deleted successfully" });
    });
  });
});

// =========================
// PATCH increment plays
// =========================
router.patch("/:id/plays", (req, res) => {
  const { id } = req.params;
  db.query(
    "UPDATE music SET plays = plays + 1 WHERE id = ?",
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Track not found" });
      // Optionally, return new play count
      db.query("SELECT plays FROM music WHERE id = ?", [id], (err2, results) => {
        if (err2) return res.status(500).json({ message: "Database error", error: err2 });
        res.json({ message: "Track play count incremented", plays: results[0]?.plays ?? null });
      });
    }
  );
});

module.exports = router;
