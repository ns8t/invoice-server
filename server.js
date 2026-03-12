require('dotenv').config();
const express = require('express');
const cors = require('cors');

const express = require('express');
const cors = require('cors');

const app = express();  // ← واحد بس!

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());
// ... باقي الكود
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/send-invoice', async (req, res) => {
  const { customer, invoice } = req.body || {};

  if (!customer?.email || !customer.email.includes('@')) {
    return res.status(400).json({ message: 'Missing or invalid customer email' });
  }

  if (!invoice?.subject || !invoice?.html) {
    return res.status(400).json({ message: 'Missing invoice subject or HTML content' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.SEND_FROM,
        to: [customer.email],
        subject: invoice.subject,
        text: invoice.text || '',
        html: invoice.html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ message: 'Failed to send invoice email' });
    }

    return res.json({ message: `Invoice sent to ${customer.email}` });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ message: 'Failed to send invoice email' });
  }
});

app.listen(PORT, () => {
  console.log(`Invoice server running on port ${PORT}`);
});
