const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // For image compression
const db = require('../db'); // MySQL connection
const router = express.Router();

// Ensure uploads/photos directory exists
const UPLOAD_DIR = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created photos upload directory:', UPLOAD_DIR);
}

// Multer storage config (store in memory for processing with sharp)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Helper: Generate unique filename
const generateFilename = (originalname) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(originalname).toLowerCase();
  return uniqueSuffix + ext;
};

// 📸 UPLOAD PHOTO — POST /api/photos
router.post('/', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const newPhotos = [];
  let completed = 0;
  const totalFiles = req.files.length;

  const finalize = () => {
    completed++;
    if (completed === totalFiles) {
      console.log(`✅ Successfully uploaded ${newPhotos.length} photo(s)`);
      res.status(201).json(newPhotos);
    }
  };

  req.files.forEach(file => {
    const originalFilename = file.originalname;
    const filename = generateFilename(originalFilename);
    const filePath = path.join(UPLOAD_DIR, filename);

    // Get category from request (default: 'general')
    const category = req.body.category || 'general';
    const description = req.body.description || '';

    // Compress & resize image using sharp
    sharp(file.buffer)
      .resize(1920, 1080, { // Max dimensions
        fit: sharp.fit.inside,
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, progressive: true }) // Convert to high-quality JPEG
      .toFile(filePath, (err, info) => {
        if (err) {
          console.error('❌ Image processing error:', err);
          return res.status(500).json({ error: 'Image processing failed' });
        }

        console.log('✅ File saved to:', filePath);

        const size = (info.size / 1024 / 1024).toFixed(2) + ' MB';
        const date = new Date().toISOString().split('T')[0];

        const query = `
          INSERT INTO photos 
          (id, file_path, original_name, size, status, views, description, mime_type, category) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const photoId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        db.query(query, [
          photoId,
          filename,
          originalFilename,
          size,
          'active', // ✅ Always set to active
          0,
          description,
          'image/jpeg',
          category
        ], (err, result) => {
          if (err) {
            console.error('❌ Database insert error:', err);
            // Clean up the file if DB insert fails
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) console.warn('⚠️ Failed to cleanup file after DB error:', unlinkErr.message);
            });
            return res.status(500).json({ error: 'Database insert failed' });
          }

          const newPhoto = {
            id: photoId,
            file_path: filename,
            originalName: originalFilename,
            size,
            status: 'active',
            views: 0,
            description,
            mimeType: 'image/jpeg',
            category,
            src: `/uploads/photos/${filename}`, // URL for frontend
            date
          };

          newPhotos.push(newPhoto);
          finalize();
        });
      });
  });
});

// 📄 GET ALL PHOTOS — GET /api/photos
router.get('/', (req, res) => {
  let query = `
    SELECT 
      id,
      file_path,
      original_name,
      size,
      status,
      views,
      description,
      mime_type,
      category,
      created_at as date
    FROM photos 
  `;

  const conditions = [];
  const values = [];

  // Filter by category
  if (req.query.category && req.query.category !== 'all') {
    conditions.push('category = ?');
    values.push(req.query.category);
  }

  // Search by keyword (full-text)
  if (req.query.search) {
    conditions.push('MATCH(original_name, description) AGAINST(? IN NATURAL LANGUAGE MODE)');
    values.push(req.query.search);
  }

  // ✅ ALWAYS filter by status — default to 'active' if not specified
  const statusFilter = req.query.status ? req.query.status.trim().toLowerCase() : 'active';
  conditions.push('LOWER(status) = ?');
  values.push(statusFilter);

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.query(query, values, (err, results) => {
    if (err) {
      console.error('❌ Fetch photos error:', err);
      return res.status(500).json({ error: 'Failed to fetch photos' });
    }

    const photos = results.map(photo => ({
      ...photo,
      src: `/uploads/photos/${photo.file_path}`, // ✅ Frontend will prefix with http://localhost:4000
      originalName: photo.original_name,
      mimeType: photo.mime_type,
      // Ensure date is formatted correctly
      date: photo.date instanceof Date 
        ? photo.date.toISOString().split('T')[0] 
        : typeof photo.date === 'string' 
          ? photo.date.split('T')[0] 
          : photo.date
    }));

    console.log(`✅ Fetched ${photos.length} photos with status='${statusFilter}'`);
    res.json(photos);
  });
});

// 🔍 GET CATEGORIES — GET /api/photos/categories
router.get('/categories', (req, res) => {
  const query = `
    SELECT 
      category as name,
      COUNT(*) as count
    FROM photos 
    GROUP BY category 
    ORDER BY category
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Categories error:', err);
      return res.status(500).json({ error: 'Failed to fetch categories' });
    }
    console.log(`✅ Fetched ${results.length} categories`);
    res.json(results);
  });
});

// 👁️ INCREMENT VIEWS — PATCH /api/photos/:id/views
router.patch('/:id/views', (req, res) => {
  const { id } = req.params;

  const query = `
    UPDATE photos 
    SET views = views + 1, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('❌ Views update error:', err);
      return res.status(500).json({ error: 'Failed to update views' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Return updated views count
    const selectQuery = `
      SELECT views 
      FROM photos 
      WHERE id = ?
    `;

    db.query(selectQuery, [id], (err, results) => {
      if (err || results.length === 0) {
        return res.status(500).json({ error: 'Could not fetch updated views' });
      }

      console.log(`✅ Photo ${id} views incremented to ${results[0].views}`);
      res.json({ views: results[0].views });
    });
  });
});

// ✏️ UPDATE PHOTO — PUT /api/photos/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { description, status, category } = req.body;

  if (!description && !status && !category) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  let fields = [];
  let values = [];

  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  if (status) {
    fields.push('status = ?');
    values.push(status);
  }
  if (category) {
    fields.push('category = ?');
    values.push(category);
  }

  values.push(id); // for WHERE clause

  const query = `
    UPDATE photos 
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `;

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('❌ Update error:', err);
      return res.status(500).json({ error: 'Update failed' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Fetch updated record
    const selectQuery = `
      SELECT 
        id,
        file_path,
        original_name,
        size,
        status,
        views,
        description,
        mime_type,
        category,
        created_at as date
      FROM photos 
      WHERE id = ?
    `;

    db.query(selectQuery, [id], (err, results) => {
      if (err || results.length === 0) {
        return res.status(500).json({ error: 'Could not fetch updated photo' });
      }

      const photo = results[0];
      const updatedPhoto = {
        ...photo,
        src: `/uploads/photos/${photo.file_path}`,
        originalName: photo.original_name,
        mimeType: photo.mime_type,
        date: photo.date instanceof Date 
          ? photo.date.toISOString().split('T')[0] 
          : typeof photo.date === 'string' 
            ? photo.date.split('T')[0] 
            : photo.date
      };

      console.log(`✅ Photo ${id} updated successfully`);
      res.json(updatedPhoto);
    });
  });
});

// 🗑️ DELETE PHOTO — DELETE /api/photos/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // First, get photo info to delete file
  const selectQuery = `
    SELECT file_path
    FROM photos 
    WHERE id = ?
  `;

  db.query(selectQuery, [id], (err, results) => {
    if (err) {
      console.error('❌ Select error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filename = results[0].file_path;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Delete from database first
    const deleteQuery = `
      DELETE FROM photos 
      WHERE id = ?
    `;

    db.query(deleteQuery, [id], (err, result) => {
      if (err) {
        console.error('❌ Delete error:', err);
        return res.status(500).json({ error: 'Failed to delete from database' });
      }

      // Then delete file from disk
      if (filename) {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            console.warn('⚠️ Failed to delete file from disk:', unlinkErr.message);
            // We don't fail the API response — DB deletion succeeded
          } else {
            console.log(`✅ File ${filename} deleted from disk`);
          }
        });
      }

      console.log(`✅ Photo ${id} deleted successfully`);
      res.json({ message: 'Photo deleted successfully' });
    });
  });
});

module.exports = router;