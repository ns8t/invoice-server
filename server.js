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
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true 
}));
app.use(express.json());

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

app.post('/send-invoice', async (req, res) => {
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

// ========================================================
// Health Check
// ========================================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========================================================
// Start Server
// ========================================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Invoice Server] Running on port ${PORT}`);
    console.log(`[Invoice Server] Resend API Key: ${process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing'}`);
});
