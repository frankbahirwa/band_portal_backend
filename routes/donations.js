const express = require('express');
const router = express.Router();

// In-memory store (replace with real DB like MongoDB/PostgreSQL later)
let donations = [
  {
    id: 1,
    donor_name: "John Doe",
    phone: "0781234567",
    amount: "5000",
    created_at: new Date().toISOString(),
    status: "confirmed"
  }
];

// POST /api/donations → handle new donation (you likely already have this)
router.post('/', (req, res) => {
  const { donor_name, phone, amount } = req.body;
  if (!donor_name || !phone || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newDonation = {
    id: donations.length + 1,
    donor_name,
    phone,
    amount: amount.toString(),
    created_at: new Date().toISOString(),
    status: "pending" // or "confirmed" if you process instantly
  };

  donations.push(newDonation);
  res.status(201).json(newDonation);
});

// ✅ GET /api/donations → NEW: return all donations
router.get('/', (req, res) => {
  res.json(donations); // ← returns raw array → perfect for frontend
});

// Optional: GET single donation
router.get('/:id', (req, res) => {
  const donation = donations.find(d => d.id === parseInt(req.params.id));
  if (!donation) return res.status(404).json({ error: "Donation not found" });
  res.json(donation);
});

module.exports = router;