// server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const multer = require("multer");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ==================
// Security & Setup
// ==================
app.use(helmet());

// Ensure uploads/blogs folder exists
const uploadDir = path.join(__dirname, "uploads");
const blogDir = path.join(uploadDir, "blogs");

if (!fs.existsSync(blogDir)) {
  fs.mkdirSync(blogDir, { recursive: true });
  console.log("📁 Created uploads/blogs directory:", blogDir);
}

// ==================
// CORS Setup
// ==================
const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").filter(Boolean) : []),
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);


// ==================
// Rate Limiter
// ==================
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ==================
// Body parsers
// ==================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ==================
// Static Uploads
// ==================
// Use express.static's setHeaders to guarantee CORS headers for all /uploads responses
// Relax Helmet security headers for /uploads
app.use("/uploads", (req, res, next) => {
  res.removeHeader && res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader && res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader && res.removeHeader("X-Frame-Options");
  res.removeHeader && res.removeHeader("Content-Security-Policy");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
  next();
});
app.use("/uploads", express.static(uploadDir, {
  setHeaders: function (res, path, stat) {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
    // Relax security headers for media
    res.removeHeader && res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader && res.removeHeader("Cross-Origin-Opener-Policy");
    res.removeHeader && res.removeHeader("X-Frame-Options");
    res.removeHeader && res.removeHeader("Content-Security-Policy");
  }
}));


// ==================
// Multer Setup for Blog Uploads
// ==================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, blogDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ==================
// Example Blog Routes
// ==================

// ==================
// Cookie parser
// ==================
app.use(cookieParser());

// ==================
// Other routes (your existing routes)
// ==================
const contactMessagesRouter = require("./routes/contactMessages");
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const youtubeRoutes = require("./routes/youtube");
const photoRoutes = require("./routes/photo");
const musicRoutes = require("./routes/music");
const donationsRoutes = require("./routes/donations");
const eventsRouter = require("./routes/events");
const blogRoutes = require("./routes/blogs");

// Mount routes
app.use("/api/events", eventsRouter);
app.use("/api/music", musicRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/donations", donationsRoutes);
app.use("/api/admin/donations", donationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/contact-messages", contactMessagesRouter);
app.use("/api", publicRoutes);

// ==================
// Health check
// ==================
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ==================
// Error Handling
// ==================
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});



// ==================
// Start Server
// ==================
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
