const express = require('express');
const axios = require('axios');
const router = express.Router();

// DeepSeek API endpoint
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// OpenRouter fallback (free Llama 3)
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// System prompt with band information
const SYSTEM_PROMPT = `You are a helpful AI assistant for a band's website. You help visitors learn about the band, their music, upcoming events, and how to support them. 

Key information about the band:
- The band has a portal where fans can view photos, read blogs, listen to music, and see upcoming events
- Visitors can contact the band through the contact page
- The band accepts donations to support their work
- The website features sections for: Home, About, Music, Photos, Blog, Events, Donate, and Contact

Be friendly, enthusiastic about the band, and guide users to the relevant pages when needed. Keep responses concise and helpful. If you don't know specific details about the band (like member names, song titles, etc.), acknowledge this and suggest they explore the website sections.`;

// POST /api/chatbot - Send message to chatbot
router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required and must be a string' 
      });
    }

    // Build messages array for DeepSeek API
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Try DeepSeek API first
    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: 'deepseek-chat',
          messages,
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      return res.json({
        success: true,
        model: 'DeepSeek',
        response: aiResponse,
        timestamp: new Date().toISOString()
      });

    } catch (deepseekError) {
      console.warn('DeepSeek failed:', deepseekError.response?.data?.error?.message || deepseekError.message);

      // If balance or auth error, fallback to OpenRouter
      const errMsg = deepseekError.response?.data?.error?.message || '';
      if (errMsg.includes('Insufficient Balance') || errMsg.includes('Authentication')) {
        console.log('Switching to free model fallback (Llama 3 via OpenRouter)...');

        const fallbackResponse = await axios.post(
          OPENROUTER_API_URL,
          {
            model: 'meta-llama/llama-3-8b-instruct',
            messages
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const fallbackReply = fallbackResponse.data.choices[0].message.content;

        return res.json({
          success: true,
          model: 'Llama 3 (fallback)',
          response: fallbackReply,
          timestamp: new Date().toISOString()
        });
      }

      // For other DeepSeek errors, throw
      throw deepseekError;
    }

  } catch (error) {
    console.error('Chatbot error:', error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to get response from chatbot. Please try again.'
    });
  }
});

// GET /api/chatbot/health - Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'Chatbot service is running',
    model: 'DeepSeek / fallback ready'
  });
});

console.log("🔑 DeepSeek key loaded:", process.env.DEEPSEEK_API_KEY ? "✅ yes" : "❌ missing");
console.log("🔑 OpenRouter key loaded:", process.env.OPENROUTER_API_KEY ? "✅ yes" : "❌ missing");

module.exports = router;
