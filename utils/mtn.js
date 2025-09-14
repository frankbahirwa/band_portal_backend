// utils/mtn.js
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const createMtnPaymentRequest = async ({ amount, phone, transactionId }) => {
  // Simulate MTN API call
  console.log(`[MTN] Simulating payment request for ${amount} RWF to ${phone}`);

  // Simulate success after 2 seconds
  setTimeout(() => {
    const status = Math.random() > 0.2 ? 'completed' : 'failed'; // 80% success rate
    verifyMtnWebhook({
      body: {
        transactionId,
        status,
        amount,
        phone
      }
    });
  }, 2000);

  return {
    success: true,
    message: 'MTN payment request simulated',
    transactionId,
    redirectUrl: `mtn://pay?phone=${phone}&amount=${amount}&ref=${transactionId}`
  };
};

// For verification: process incoming webhook payload from MTN
const verifyMtnWebhook = (req) => {
  const payload = req.body;
  console.log('[MTN Webhook Received]', payload);

  // This will be handled in public.js route
  return payload;
};

module.exports = { createMtnPaymentRequest, verifyMtnWebhook };