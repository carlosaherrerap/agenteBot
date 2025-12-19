const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Send an email to the advisor when user requests a human assistant.
 * @param {string} dni - User's DNI number.
 * @param {string} query - User's query or request.
 */
async function sendAdvisorEmail(dni, query) {
    try {
        // Validate environment variables
        if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
            throw new Error('Gmail credentials not configured in .env file');
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS,
            },
        });

        // Verify connection configuration
        await transporter.verify();
        console.log('✅ Gmail connection verified successfully');

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: 'carlos.a.h.palma@gmail.com',
            subject: `Contacto Asesor - DNI ${dni}`,
            text: `El cliente con DNI: ${dni} solicita contacto.\n\nConsulta: ${query}\n\nFecha: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Lima' })}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #667eea;">📧 Solicitud de Contacto con Asesor</h2>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <p><strong>DNI del Cliente:</strong> ${dni}</p>
                        <p><strong>Consulta:</strong></p>
                        <p style="background: white; padding: 15px; border-left: 4px solid #667eea;">${query}</p>
                        <p style="color: #666; font-size: 12px; margin-top: 20px;">
                            <strong>Fecha:</strong> ${new Date().toLocaleString('es-ES', { timeZone: 'America/Lima' })}
                        </p>
                    </div>
                    <p style="color: #999; font-size: 11px; margin-top: 30px;">
                        Este mensaje fue enviado automáticamente por el ChatBot de InformaPeru
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Advisor email sent successfully:', info.messageId);
        console.log('   To:', mailOptions.to);
        console.log('   DNI:', dni);

        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('❌ Error sending advisor email:', error.message);

        // Provide specific error messages
        if (error.message.includes('Invalid login') || error.message.includes('534')) {
            console.error('\n⚠️  GMAIL CONFIGURATION ERROR:');
            console.error('   Gmail requires an "App Password" instead of your regular password.');
            console.error('   Please follow these steps:');
            console.error('   1. Go to: https://myaccount.google.com/apppasswords');
            console.error('   2. Generate a new App Password for "Mail"');
            console.error('   3. Update GMAIL_PASS in your .env file with the 16-character password');
            console.error('   4. For detailed instructions, see: GMAIL_SETUP.md\n');
        } else if (error.message.includes('EAUTH')) {
            console.error('\n⚠️  AUTHENTICATION ERROR:');
            console.error('   Check your GMAIL_USER and GMAIL_PASS in .env file');
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
            console.error('\n⚠️  CONNECTION ERROR:');
            console.error('   Cannot connect to Gmail servers. Check your internet connection.');
        }

        throw error; // Re-throw to be caught by the flow
    }
}

module.exports = { sendAdvisorEmail };

