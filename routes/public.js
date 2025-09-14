// routes/public.js
const express = require('express');
const router = express.Router(); // ✅ THIS WAS MISSING — ADD THIS LINE
const pool = require('../db');
const { body, validationResult } = require('express-validator');
const { createMtnPaymentRequest, verifyMtnWebhook } = require('../utils/mtn');

const runQuery = (sql, params) => new Promise((resolve, reject) => {
  pool.query(sql, params, (err, results) => {
    if (err) return reject(err);
    resolve(results);
  });
});

// Serve music list
router.get('/music', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, title, file_path, created_at FROM music ORDER BY created_at DESC',
      []
    );
    res.json({ music: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Serve photos
router.get('/photos', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, file_path, caption FROM photos ORDER BY created_at DESC',
      []
    );
    res.json({ photos: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Blogs list
router.get('/blogs', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, title, content, created_at FROM blogs ORDER BY created_at DESC',
      []
    );
    res.json({ blogs: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// About
router.get('/about', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT content, updated_at FROM about LIMIT 1',
      []
    );
    res.json({ about: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Contact info
router.get('/contact', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT email, phone, address, updated_at FROM contact LIMIT 1',
      []
    );
    res.json({ contact: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/contact-message
router.post('/contact-message', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('message').notEmpty().withMessage('Message is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, message } = req.body;

  try {
    await runQuery(
      'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)',
      [name, email, message]
    );
    res.status(201).json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/*
  Donation flow:

  1) Public sends donation form with donor_name, phone, amount
  2) Server creates a local donation record with status 'pending' and generates a transaction_id
  3) Server calls MTN API (createMtnPaymentRequest) to start payment (this is stubbed)
  4) Return whatever MTN requires (checkout URL or prompt). The client should then follow MTN process.
  5) MTN will call our webhook with payment result -> handle in /webhook/mtn
*/

router.post(
  '/donate',
  [
    body('donor_name').isString().notEmpty(),
    body('phone').isString().notEmpty(),
    body('amount').isFloat({ gt: 0 })
  ],
  async (req, res) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty())
        return res.status(400).json({ errors: err.array() });

      const { donor_name, phone, amount } = req.body;
      const transactionId =
        'tx_' + Date.now() + Math.random().toString(36).slice(2, 9);

      // Insert pending donation
      await runQuery(
        'INSERT INTO donations (donor_name, phone, amount, transaction_id, status) VALUES (?, ?, ?, ?, ?)',
        [donor_name, phone, amount, transactionId, 'pending']
      );

      // Create MTN payment request (stub). Replace with real MTN call.
      const mtnResp = await createMtnPaymentRequest({
        amount,
        phone,
        transactionId,
        externalId: transactionId,
        payerMessage: `Donation to band by ${donor_name}`,
        payeeNote: `Donation ${transactionId}`
      });

      // Return the MTN response (client will handle redirect/USSD/popup)
      return res.json({ message: 'Donation initiated', transactionId, mtnResp });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// MTN webhook: called by MTN to confirm transaction
router.post('/webhook/mtn', express.json(), async (req, res) => {
  try {
    const payload = req.body; // Use req.body directly

    const transactionId =
      payload.transactionId ||
      payload.externalId ||
      payload.reference ||
      payload.transactionRef;
    const statusRaw = (payload.status || payload.paymentStatus || '')
      .toString()
      .toLowerCase();

    let status = 'failed';
    if (statusRaw.includes('success') || statusRaw.includes('completed'))
      status = 'confirmed';
    else if (statusRaw.includes('pending')) status = 'pending';
    else status = 'failed';

    if (!transactionId) {
      console.warn('Webhook missing transaction id', payload);
      return res.status(400).json({ message: 'Missing transaction id' });
    }

    // Update donation
    await runQuery('UPDATE donations SET status = ? WHERE transaction_id = ?', [
      status,
      transactionId
    ]);

    console.log(`[MTN] Donation ${transactionId} updated to ${status}`);

    // Done, just respond to MTN
    return res.json({ message: 'Webhook processed' });
  } catch (err) {
    console.error('Webhook error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;  