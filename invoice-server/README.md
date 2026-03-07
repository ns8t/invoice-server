# Gamers Cash Invoice Server

Production-ready invoice email server for Gamers Cash using Resend.com as the email delivery service.

## Overview

This server receives invoice requests from the Gamers Cash frontend (after checkout) and sends formatted HTML emails to customers using the Resend API. It's designed to handle 100-200 orders per day (~4000-6000 emails/month).

### How It Works

1. Customer completes checkout on the website
2. Frontend calls `sendInvoiceEmail(order)` in `sicrept.js`
3. Frontend sends POST request to `/send-invoice` endpoint with invoice data
4. Server validates the request and sends email via Resend API
5. Server returns success/error response to frontend
6. Frontend updates UI with delivery status

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
cd invoice-server
npm install
```

### 2. Get Resend API Key

1. Sign up free at [resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Copy the key (starts with `re_`)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
RESEND_API_KEY=re_your_api_key_here
SEND_FROM=Gamers Cash <info@gamerscash.com>
ALLOWED_ORIGIN=https://gamerscash.com
PORT=3001
```

### 4. Verify Sending Domain (Production)

1. Go to [resend.com/domains](https://resend.com/domains)
2. Add your domain (e.g., `gamerscash.com`)
3. Follow DNS verification steps
4. Update `SEND_FROM` in `.env` with your verified domain

**For testing only:** Use `onboarding@resend.dev` as the sender email

### 5. Run Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Expected output:
```
🎮 Gamers Cash Invoice Server
📧 Listening on port 3001
🔗 Endpoint: POST http://localhost:3001/send-invoice
✅ Health check: GET http://localhost:3001/health
```

## API Endpoints

### POST /send-invoice

Sends an invoice email to the customer.

**Request Body:**
```json
{
  "type": "order-invoice",
  "storeName": "Gamers Cash",
  "businessEmail": "info@gamerscash.com",
  "customer": {
    "email": "customer@example.com",
    "phone": "+962791433878"
  },
  "order": {
    "reference": "GC-20240115-0001",
    "createdAt": "2024-01-15T10:30:00Z",
    "items": [...],
    "totals": {...},
    "checkout": {...}
  },
  "invoice": {
    "subject": "Gamers Cash invoice GC-20240115-0001",
    "text": "Plain text version of invoice",
    "html": "<html>Styled HTML email template</html>"
  }
}
```

**Success Response (200):**
```json
{
  "message": "Invoice sent to customer@example.com"
}
```

**Error Responses:**

- **400 - Missing Email:**
  ```json
  {
    "message": "Missing or invalid customer email"
  }
  ```

- **400 - Missing Invoice Data:**
  ```json
  {
    "message": "Missing invoice subject or HTML content"
  }
  ```

- **405 - Method Not Allowed:**
  ```json
  {
    "message": "Method not allowed"
  }
  ```

- **500 - Resend API Error:**
  ```json
  {
    "message": "Failed to send invoice email"
  }
  ```

### GET /health

Health check endpoint to verify server is running.

**Response (200):**
```json
{
  "status": "ok",
  "service": "gamers-cash-invoice-server",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Testing

### Health Check

```bash
curl http://localhost:3001/health
```

### Send Test Invoice

```bash
curl -X POST http://localhost:3001/send-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "email": "test@example.com",
      "phone": "+962799999999"
    },
    "invoice": {
      "subject": "Gamers Cash invoice GC-TEST-0001",
      "text": "Test invoice",
      "html": "<h1>Test Invoice</h1><p>This is a test invoice from Gamers Cash.</p>"
    }
  }'
```

Expected response:
```json
{
  "message": "Invoice sent to test@example.com"
}
```

### Test with Invalid Email

```bash
curl -X POST http://localhost:3001/send-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "email": "invalid-email",
      "phone": "+962799999999"
    },
    "invoice": {
      "subject": "Test",
      "html": "<h1>Test</h1>"
    }
  }'
```

Expected response (400):
```json
{
  "message": "Missing or invalid customer email"
}
```

## Frontend Integration

### Update main.html

Find the `<body>` opening tag in `main.html` and update the `data-invoice-endpoint` attribute:

**Current:**
```html
<body class="theme-dark home-page" data-store-name="Gamers Cash" data-business-email="v00ss.business@gmail.com" data-invoice-endpoint="">
```

**Change to:**
```html
<body class="theme-dark home-page" data-store-name="Gamers Cash" data-business-email="v00ss.business@gmail.com" data-invoice-endpoint="https://your-server-domain.com/send-invoice">
```

Replace `https://your-server-domain.com` with your actual server URL:
- **Local testing:** `http://localhost:3001/send-invoice`
- **Production:** `https://invoice.gamerscash.com/send-invoice` (or your domain)

## Deployment Options

### Option 1: Railway.app (Recommended - Free Tier)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Create new project → Connect GitHub repo
4. Set environment variables in dashboard:
   - `RESEND_API_KEY`
   - `SEND_FROM`
   - `ALLOWED_ORIGIN`
   - `PORT`
5. Deploy automatically on push

### Option 2: Render.com (Free Tier)

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Create new Web Service → Connect GitHub repo
4. Set environment variables
5. Deploy

### Option 3: DigitalOcean VPS

1. SSH into your VPS
2. Clone repository
3. Install Node.js and npm
4. Run:
   ```bash
   cd invoice-server
   npm install
   npm start
   ```
5. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "invoice-server"
   pm2 startup
   pm2 save
   ```
6. Set up Nginx reverse proxy on port 80/443

### Option 4: Heroku (Paid)

1. Install Heroku CLI
2. Run:
   ```bash
   heroku create gamers-cash-invoice
   heroku config:set RESEND_API_KEY=re_xxx
   heroku config:set SEND_FROM="Gamers Cash <info@gamerscash.com>"
   git push heroku main
   ```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | Resend API key (get from resend.com/api-keys) |
| `SEND_FROM` | No | `Gamers Cash <info@gamerscash.com>` | Sender email address (must be verified on Resend) |
| `ALLOWED_ORIGIN` | No | `http://localhost:3000` | CORS allowed origin (your website domain) |
| `PORT` | No | `3001` | Server port |

## Logging

The server logs all invoice sends and errors with timestamps:

```
[2024-01-15T10:30:45.123Z] Invoice sent successfully
  To: customer@example.com
  Subject: Gamers Cash invoice GC-20240115-0001
  Message ID: abc123def456
```

## Error Handling

- **Invalid email format:** Returns 400 with validation error
- **Missing invoice data:** Returns 400 with field error
- **Resend API failure:** Returns 500 with generic error (details in server logs)
- **CORS violation:** Request rejected by browser
- **Non-POST request:** Returns 405 Method Not Allowed

## Security Considerations

1. **CORS Protection:** Only requests from `ALLOWED_ORIGIN` are accepted
2. **Email Validation:** All emails are validated before sending
3. **API Key Security:** Never commit `.env` file to version control
4. **Rate Limiting:** Consider adding rate limiting for production (use `express-rate-limit`)
5. **Input Validation:** All required fields are validated

## Monitoring & Maintenance

### Check Server Status

```bash
curl https://your-server-domain.com/health
```

### View Logs

**Local:**
```bash
npm run dev
```

**Production (with PM2):**
```bash
pm2 logs invoice-server
```

### Resend Dashboard

Monitor email delivery at [resend.com/emails](https://resend.com/emails):
- View sent emails
- Check bounce/complaint rates
- Monitor API usage

## Troubleshooting

### "RESEND_API_KEY is not set"

Make sure `.env` file exists and contains `RESEND_API_KEY=re_xxx`

### "Failed to send invoice email"

1. Check Resend API key is valid
2. Verify sender domain is verified on Resend
3. Check email address is valid
4. Review server logs for detailed error

### CORS errors in browser console

Update `ALLOWED_ORIGIN` in `.env` to match your website domain

### Port already in use

Change `PORT` in `.env` or kill process using the port:
```bash
# macOS/Linux
lsof -i :3001
kill -9 <PID>

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

## Support & Resources

- **Resend Documentation:** https://resend.com/docs
- **Express Documentation:** https://expressjs.com
- **Node.js Documentation:** https://nodejs.org/docs

## License

MIT
