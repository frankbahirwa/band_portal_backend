const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper: Generate unique transaction_id
function generateTransactionId() {
  return 'tx_' + Date.now() + Math.random().toString(36).substring(2, 8);
}

// ✅ POST /api/donations → Save donation
router.post('/', (req, res) => {
  const { donor_name, phone, amount } = req.body;

  if (!donor_name || !phone || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const transaction_id = generateTransactionId();
  const status = 'pending';

  const sql = `
    INSERT INTO donations (donor_name, phone, amount, transaction_id, status)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(sql, [donor_name, phone, amount, transaction_id, status], (err, result) => {
    if (err) {
      console.error('❌ Error saving donation:', err);
      return res.status(500).json({ error: "Database error" });
    }

    const newDonation = {
      id: result.insertId,
      donor_name,
      phone,
      amount,
      transaction_id,
      status,
      created_at: new Date().toISOString()
    };

    res.status(201).json(newDonation);
  });
});

// ✅ GET /api/donations → Retrieve all donations
router.get('/', (req, res) => {
  const sql = `SELECT * FROM donations ORDER BY created_at DESC`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Error fetching donations:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// ✅ GET /api/donations/:id → Retrieve one donation
router.get('/:id', (req, res) => {
  const sql = `SELECT * FROM donations WHERE id = ?`;
  db.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error('❌ Error fetching donation:', err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Donation not found" });
    }

    res.json(results[0]);
  });
});

module.exports = router;
