const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Send an email to the advisor when user requests a human assistant.
 * @param {string} dni - User's DNI number.
 * @param {string} query - User's query or request.
 */
async function sendAdvisorEmail(dni, query) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: 'carlos.a.h.palma@gmail.com',
        subject: `Contacto Asesor - DNI ${dni}`,
        text: `El cliente con DNI: ${dni} solicita contacto. Consulta: ${query}`,
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { sendAdvisorEmail };
