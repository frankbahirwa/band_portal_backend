// routes/events.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // your MySQL connection pool

// ==========================
// POST subscribe email (public)
// ==========================
router.post('/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const id = Date.now().toString();
  db.query(
    'INSERT INTO subscribers (id, email) VALUES (?, ?)',
    [id, email],
    (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Email already subscribed' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: 'Subscribed successfully' });
    }
  );
});

// ==========================
// GET all events (public)
// ==========================
router.get('/', (req, res) => {
  const sql = "SELECT * FROM events WHERE status IN ('confirmed', 'pending', 'scheduled') ORDER BY date ASC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ==========================
// GET single event (public)
// ==========================
router.get('/:id', (req, res) => {
  const sql = "SELECT * FROM events WHERE id = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.status(404).json({ error: 'Event not found' });
    res.json(results[0]);
  });
});

// ==========================
// POST new event (admin)
// ==========================
router.post('/', (req, res) => {
  const { name, date, venue, status = 'scheduled' } = req.body;
  if (!name || !date || !venue) {
    return res.status(400).json({ error: 'Name, date, and venue are required' });
  }

  const sql = "INSERT INTO events (name, date, venue, status) VALUES (?, ?, ?, ?)";
  db.query(sql, [name, date, venue, status], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, name, date, venue, status });
  });
});

// ==========================
// PUT update event (admin)
// ==========================
router.put('/:id', (req, res) => {
  const { name, date, venue, status } = req.body;
  const sql = "UPDATE events SET name = ?, date = ?, venue = ?, status = ? WHERE id = ?";
  db.query(sql, [name, date, venue, status, req.params.id], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ id: req.params.id, name, date, venue, status });

    // If status is confirmed, send notification to all subscribers
    if (status === 'confirmed') {
      db.query('SELECT email FROM subscribers', async (err2, subs) => {
        if (!err2 && subs.length) {
          const { sendMail } = require('../utils/mailer');
          const subject = `New Event: ${name}`;
          const text = `A new event has been released!\n\nEvent: ${name}\nDate: ${date}\nVenue: ${venue}`;
          const html = `<h2>New Event Released!</h2><p><b>Event:</b> ${name}<br><b>Date:</b> ${date}<br><b>Venue:</b> ${venue}</p>`;
          for (const sub of subs) {
            try {
              await sendMail({ to: sub.email, subject, text, html });
            } catch (mailErr) {
              console.error('Failed to send mail to', sub.email, mailErr.message);
            }
          }
        }
      });
    }
  });
});

// ==========================
// DELETE event (admin)
// ==========================
router.delete('/:id', (req, res) => {
  const sql = "DELETE FROM events WHERE id = ?";
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  });
});

module.exports = router;
