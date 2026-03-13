// ============================================================
// invoice-server.js — Invoice Generation & Email Service
// استخدم على Railway
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { Resend } = require('resend');

const app = express();
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const DEFAULT_ALLOWED_ORIGINS = [
    'https://gamerscash.net',
    'https://www.gamerscash.net',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
];
const ALLOWED_ORIGINS = Array.from(
    new Set(
        [
            ...DEFAULT_ALLOWED_ORIGINS,
            ...String(process.env.ALLOWED_ORIGIN || '')
                .split(',')
                .map((origin) => origin.trim())
                .filter(Boolean)
        ]
    )
);

app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

function getRequiredSupabaseConfig() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on the server.');
    }
}

function getResendClient() {
    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) {
        throw new Error('Missing RESEND_API_KEY on the server.');
    }

    return new Resend(resendApiKey);
}

function getReplyToAddress() {
    return String(process.env.SEND_REPLY_TO || process.env.SMTP_FROM || 'info@gamerscash.com').trim();
}

function getSendFromAddress() {
    return String(process.env.SEND_FROM || 'Gamers Cash <info@gamerscash.com>').trim();
}

function getBearerToken(req) {
    const authHeader = String(req.get('Authorization') || '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return '';
    }

    return authHeader.slice(7).trim();
}

async function readJsonResponse(response) {
    const rawText = await response.text();
    if (!rawText) {
        return null;
    }

    try {
        return JSON.parse(rawText);
    } catch (error) {
        return { rawText };
    }
}

async function fetchSupabaseJson(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await readJsonResponse(response);

    if (!response.ok) {
        const error = new Error(
            payload?.msg
            || payload?.message
            || payload?.error_description
            || payload?.error
            || `Supabase request failed (${response.status})`
        );
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

async function getUserFromAccessToken(accessToken) {
    getRequiredSupabaseConfig();

    return fetchSupabaseJson(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
            'apikey': SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${accessToken}`
        }
    });
}

async function deletePublicRows(table, filters) {
    getRequiredSupabaseConfig();

    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(filters).forEach(([column, value]) => {
        url.searchParams.set(column, `eq.${value}`);
    });

    const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Prefer': 'return=minimal'
        }
    });

    if (!response.ok) {
        const payload = await readJsonResponse(response);
        console.warn(
            `[Delete Account] Failed to delete from ${table}:`,
            payload?.message || payload?.error || response.statusText
        );
    }
}

async function deleteAuthUser(userId) {
    getRequiredSupabaseConfig();

    await fetchSupabaseJson(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
    });
}

async function generatePasswordRecoveryLink(email, redirectTo) {
    getRequiredSupabaseConfig();

    const payload = await fetchSupabaseJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'recovery',
            email,
            redirect_to: redirectTo,
            redirectTo
        })
    });

    const actionLink = payload?.action_link
        || payload?.actionLink
        || payload?.properties?.action_link
        || payload?.properties?.actionLink
        || payload?.data?.action_link
        || payload?.data?.actionLink
        || '';

    if (!actionLink) {
        throw new Error('Supabase did not return a password recovery link.');
    }

    return {
        actionLink,
        payload
    };
}

async function sendPasswordRecoveryEmail(email, actionLink) {
    const resend = getResendClient();

    return resend.emails.send({
        from: getSendFromAddress(),
        to: email,
        subject: 'Reset your Gamers Cash password',
        replyTo: getReplyToAddress(),
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
                <h2 style="margin-bottom: 16px; color: #111827;">Reset your password</h2>
                <p style="line-height: 1.6; color: #374151;">We received a request to reset the password for your Gamers Cash account.</p>
                <p style="line-height: 1.6; color: #374151;">Click the button below to choose a new password:</p>
                <p style="margin: 28px 0;">
                    <a href="${actionLink}" style="display: inline-block; background: #8aa2ff; color: #0b0b0b; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 10px;">Reset Password</a>
                </p>
                <p style="line-height: 1.6; color: #374151;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #4b5563;">${actionLink}</p>
                <p style="line-height: 1.6; color: #6b7280;">If you did not request this, you can safely ignore this email.</p>
            </div>
        `,
        text: [
            'Reset your Gamers Cash password',
            '',
            'Open this link to choose a new password:',
            actionLink,
            '',
            'If you did not request this, you can ignore this email.'
        ].join('\n')
    });
}

// ========================================================
// Generate Invoice PDF
// ========================================================

function generateInvoicePDF(orderData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 40
            });

            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });

            // ========================================================
            // Header
            // ========================================================

            doc.fontSize(24).font('Helvetica-Bold').text('GAMERS CASH', { align: 'left' });
            doc.fontSize(10).font('Helvetica').text('Gaming Gear Delivered Fast', { align: 'left' });
            
            doc.moveTo(40, 70).lineTo(555, 70).stroke();
            doc.moveDown(0.5);

            // Invoice Info
            doc.fontSize(12).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
            doc.fontSize(10).font('Helvetica')
                .text(`Ticket ID: ${orderData.ticket_id}`, { align: 'right' })
                .text(`Date: ${new Date(orderData.created_at).toLocaleDateString()}`, { align: 'right' });

            doc.moveDown(1);

            // ========================================================
            // Customer Info
            // ========================================================

            doc.fontSize(11).font('Helvetica-Bold').text('BILL TO:', 40);
            doc.fontSize(10).font('Helvetica')
                .text(orderData.customer_name, 40)
                .text(orderData.customer_email, 40)
                .text(orderData.customer_phone, 40)
                .text(orderData.address, 40);

            doc.moveDown(1.5);
            doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
            doc.moveDown(0.5);

            // ========================================================
            // Order Items Table
            // ========================================================

            const tableTop = doc.y;
            const col1 = 50;
            const col2 = 200;
            const col3 = 350;
            const col4 = 450;
            const col5 = 520;

            // Header
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Item', col1, tableTop);
            doc.text('Description', col2, tableTop);
            doc.text('Price', col3, tableTop);
            doc.text('Qty', col4, tableTop);
            doc.text('Total', col5, tableTop, { align: 'right' });

            doc.moveTo(40, tableTop + 15).lineTo(555, tableTop + 15).stroke();

            let yPosition = tableTop + 25;
            doc.fontSize(9).font('Helvetica');

            // Items
            if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item, index) => {
                    const itemName = (item.name || 'Product').substring(0, 30);
                    const description = (item.description || '').substring(0, 40);
                    const price = item.price || 0;
                    const quantity = item.quantity || 1;
                    const total = price * quantity;

                    // Item image (if available)
                    if (item.image && yPosition + 60 < 750) {
                        try {
                            doc.image(item.image, col1, yPosition, { 
                                width: 40, 
                                height: 40 
                            });
                        } catch (e) {
                            console.log('Could not load image:', item.image);
                        }
                    }

                    doc.text(itemName, col2, yPosition);
                    doc.text(description, col2, yPosition + 12, { fontSize: 8, color: '#666' });
                    doc.fontSize(9).text(`${price.toFixed(2)} JOD`, col3, yPosition);
                    doc.text(quantity, col4, yPosition);
                    doc.text(`${total.toFixed(2)} JOD`, col5, yPosition, { align: 'right' });

                    yPosition += 50;

                    if (yPosition > 700) {
                        doc.addPage();
                        yPosition = 50;
                    }
                });
            }

            yPosition += 10;
            doc.moveTo(40, yPosition).lineTo(555, yPosition).stroke();
            yPosition += 20;

            // ========================================================
            // Summary
            // ========================================================

            doc.fontSize(10);
            
            const subtotal = orderData.subtotal || orderData.total_price || 0;
            const delivery = orderData.delivery_fee || 0;
            const total = orderData.total_price || 0;
            const points = Math.round(total);

            doc.text('Subtotal:', col3, yPosition);
            doc.text(`${subtotal.toFixed(2)} JOD`, col5, yPosition, { align: 'right' });

            yPosition += 20;
            doc.text('Delivery Fee:', col3, yPosition);
            doc.text(`${delivery.toFixed(2)} JOD`, col5, yPosition, { align: 'right' });

            yPosition += 20;
            doc.text('Reward Points:', col3, yPosition);
            doc.text(`+${points} pts`, col5, yPosition, { align: 'right' });

            yPosition += 20;
            doc.moveTo(col3, yPosition).lineTo(555, yPosition).stroke();
            yPosition += 10;

            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('TOTAL:', col3, yPosition);
            doc.text(`${total.toFixed(2)} JOD`, col5, yPosition, { align: 'right' });

            // ========================================================
            // Footer
            // ========================================================

            doc.moveDown(2);
            doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
            doc.fontSize(9).font('Helvetica');
            doc.text('Thank you for your purchase!', { align: 'center' });
            doc.text('Gamers Cash | Amman, Jordan', { align: 'center' });
            doc.text('info@gamerscash.com | +962 79 143 3878', { align: 'center' });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

// ========================================================
// Send Invoice Email
// ========================================================

app.post(['/send-invoice', '/api/send-invoice'], async (req, res) => {
    try {
        const { 
            ticket_id,
            customer_email,
            customer_name,
            customer_phone,
            address,
            items,
            subtotal,
            delivery_fee,
            total_price,
            created_at,
            currency = 'JOD'
        } = req.body;

        // Validate
        if (!ticket_id || !customer_email || !items || !total_price) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        console.log(`[Invoice] Generating PDF for ticket: ${ticket_id}`);

        // Generate PDF
        const pdfBuffer = await generateInvoicePDF({
            ticket_id,
            customer_email,
            customer_name,
            customer_phone,
            address,
            items,
            subtotal,
            delivery_fee,
            total_price,
            created_at,
            currency
        });

        console.log(`[Invoice] PDF generated, size: ${pdfBuffer.length} bytes`);

        const resend = getResendClient();

        // Send Email
        const result = await resend.emails.send({
            from: 'Gamers Cash <noreply@gamerscash.com>',
            to: customer_email,
            subject: `Invoice #${ticket_id} - Gamers Cash`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #8aa2ff;">Order Confirmation</h2>
                    <p>Hi ${customer_name},</p>
                    <p>Thank you for your order! Your invoice has been attached to this email.</p>
                    <p><strong>Order Details:</strong></p>
                    <ul>
                        <li>Ticket ID: ${ticket_id}</li>
                        <li>Total: ${total_price.toFixed(2)} ${currency}</li>
                        <li>Delivery Fee: ${(delivery_fee || 0).toFixed(2)} ${currency}</li>
                        <li>Reward Points: +${Math.round(total_price)} pts</li>
                    </ul>
                    <p>We will contact you soon with shipping details.</p>
                    <p>Best regards,<br><strong>Gamers Cash Team</strong></p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">
                        Gamers Cash | Amman, Jordan<br>
                        info@gamerscash.com | +962 79 143 3878
                    </p>
                </div>
            `,
            attachments: [
                {
                    filename: `invoice-${ticket_id}.pdf`,
                    content: pdfBuffer
                }
            ]
        });

        console.log(`[Invoice] Email sent successfully to ${customer_email}`);

        res.json({ 
            success: true, 
            message: 'Invoice sent successfully',
            result 
        });

    } catch (error) {
        console.error('[Invoice] Error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to send invoice' 
        });
    }
});

app.post(['/send-password-reset', '/api/send-password-reset'], async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const redirectTo = String(req.body?.redirectTo || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            error: 'Missing or invalid email address.'
        });
    }

    if (!redirectTo) {
        return res.status(400).json({
            error: 'Missing redirectTo URL.'
        });
    }

    try {
        const { actionLink } = await generatePasswordRecoveryLink(email, redirectTo);
        await sendPasswordRecoveryEmail(email, actionLink);

        return res.status(200).json({
            success: true,
            message: 'Password reset email sent.'
        });
    } catch (error) {
        const normalizedMessage = String(error?.message || '').toLowerCase();
        const userNotFound = normalizedMessage.includes('user not found')
            || normalizedMessage.includes('email not found')
            || normalizedMessage.includes('for security purposes');

        if (userNotFound) {
            return res.status(200).json({
                success: true,
                message: 'Password reset email sent.'
            });
        }

        console.error('[Password Reset] Error:', error);
        return res.status(Number.isInteger(error?.status) ? error.status : 500).json({
            error: error?.message || 'Failed to send password reset email.'
        });
    }
});

// ========================================================
// Delete Account
// ========================================================

app.post(['/delete-account', '/api/delete-account'], async (req, res) => {
    try {
        const accessToken = getBearerToken(req);
        if (!accessToken) {
            return res.status(401).json({ error: 'Missing bearer token.' });
        }

        const user = await getUserFromAccessToken(accessToken);
        if (!user?.id) {
            return res.status(401).json({ error: 'Authenticated user not found.' });
        }

        await Promise.allSettled([
            deletePublicRows('profiles', { id: user.id }),
            deletePublicRows('orders', { user_id: user.id }),
            deletePublicRows('orders', { customer_id: user.id })
        ]);

        await deleteAuthUser(user.id);

        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully.',
            userId: user.id
        });
    } catch (error) {
        console.error('[Delete Account] Error:', error);

        const status = Number.isInteger(error?.status) ? error.status : 500;
        const message = status >= 500
            ? 'Delete-account service is not ready. Check server env vars and deployment logs.'
            : error.message;

        return res.status(status).json({
            error: message
        });
    }
});

// ========================================================
// Health Check
// ========================================================

app.get(['/health', '/api/health'], (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        emailConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
        deleteAccountConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    });
});

// ========================================================
// Start Server
// ========================================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Invoice Server] Running on port ${PORT}`);
    console.log(`[Invoice Server] Resend API Key: ${process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`[Invoice Server] Supabase URL: ${SUPABASE_URL ? '✓ Set' : '✗ Missing'}`);
    console.log(`[Invoice Server] Supabase Service Role: ${SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`[Invoice Server] Allowed Origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
