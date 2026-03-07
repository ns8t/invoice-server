const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEND_FROM = process.env.SEND_FROM || 'Gamers Cash <info@gamerscash.com>';

// Initialize Resend client
const resend = new Resend(RESEND_API_KEY);

// Middleware
app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET'],
  credentials: true
}));

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
function isValidEmail(email) {
  return typeof email === 'string' && emailRegex.test(email);
}

/**
 * POST /send-invoice
 * Sends invoice email via Resend
 */
app.post('/send-invoice', async (req, res) => {
  try {
    const { customer, invoice } = req.body;

    // Validate customer email
    if (!customer || !customer.email) {
      return res.status(400).json({
        message: 'Missing or invalid customer email'
      });
    }

    if (!isValidEmail(customer.email)) {
      return res.status(400).json({
        message: 'Missing or invalid customer email'
      });
    }

    // Validate invoice data
    if (!invoice || !invoice.subject || !invoice.html) {
      return res.status(400).json({
        message: 'Missing invoice subject or HTML content'
      });
    }

    // Send email via Resend
    const result = await resend.emails.send({
      from: SEND_FROM,
      to: customer.email,
      subject: invoice.subject,
      text: invoice.text || 'Invoice from Gamers Cash',
      html: invoice.html
    });

    // Check for Resend API errors
    if (result.error) {
      console.error(`[${new Date().toISOString()}] Resend API error:`, result.error);
      return res.status(500).json({
        message: 'Failed to send invoice email'
      });
    }

    console.log(`[${new Date().toISOString()}] Invoice sent successfully`);
    console.log(`  To: ${customer.email}`);
    console.log(`  Subject: ${invoice.subject}`);
    console.log(`  Message ID: ${result.data?.id}`);

    return res.status(200).json({
      message: `Invoice sent to ${customer.email}`
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending invoice:`, error.message);
    return res.status(500).json({
      message: 'Failed to send invoice email'
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'gamers-cash-invoice-server',
    timestamp: new Date().toISOString()
  });
});

/**
 * Handle non-POST requests to /send-invoice
 */
app.all('/send-invoice', (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Method not allowed'
    });
  }
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    message: 'Endpoint not found'
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err);
  res.status(500).json({
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎮 Gamers Cash Invoice Server`);
  console.log(`📧 Listening on port ${PORT}`);
  console.log(`🔗 Endpoint: POST http://localhost:${PORT}/send-invoice`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/health`);
  console.log(`\n📋 Configuration:`);
  console.log(`   Resend API Key: ${RESEND_API_KEY ? '***' : 'NOT SET'}`);
  console.log(`   Send From: ${SEND_FROM}`);
  console.log(`   Allowed Origin: ${ALLOWED_ORIGIN}`);
  console.log(`\n⚠️  Make sure all environment variables are configured in .env\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
