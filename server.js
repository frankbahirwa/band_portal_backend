// server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const path = require("path");
const fs = require("fs"); // ✅ Required for uploads
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ==================
// Security & Setup
// ==================
app.use(helmet());

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created uploads directory:', uploadDir);
}

// ✅ SERVE STATIC FILES WITH CORS HEADERS — PLACE THIS BEFORE ROUTES
app.use("/uploads", (req, res, next) => {
  // Set CORS headers for images
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // If it's a preflight request, respond immediately
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
}, express.static(uploadDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// Body parsers — must come before routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// CORS — Allow frontend origin + credentials
const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").filter(Boolean) : [])
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Rate limiter
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ==================
// Routes — Specific before generic
// ==================
const contactMessagesRouter = require('./routes/contactMessages');
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const youtubeRoutes = require("./routes/youtube");
const photoRoutes = require("./routes/photo"); // ✅ Fixed route
const blogRoutes = require("./routes/blogs"); // ✅ Added blog routes
// Import music routes
const musicRoutes = require("./routes/music");

// Mount music routes
app.use("/api/music", musicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/blogs", blogRoutes); // ✅ Mounted blog routes
app.use("/api/contact-messages", contactMessagesRouter); // ✅ Plural to match frontend
app.use("/api", publicRoutes); // catch-all for other public APIs

// ==================
// Health check
// ==================
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ==================
// Error Handling
// ==================
// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});