const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Send an email to the advisor when user requests a human assistant.
 * @param {string} dni - User's DNI number.
 * @param {string} query - User's query or request.
 * @param {object} clientData - Full client data from database (optional).
 */
async function sendAdvisorEmail(dni, query, clientData = null) {
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

        // Extract phone numbers from all available fields
        let phoneNumbers = [];
        if (clientData) {
            const phoneFields = [
                'TELEFONO_FIJO_TITULAR',
                'TELEFONO_TITULAR',
                'TELEFONO_REPRESENTANTE',
                'TELEFONO_CONYUGE',
                'TELEFONO_CODEUDOR',
                'TELEFONO_FIADOR',
                'TELEFONO_CONY_FIADOR'
            ];

            phoneFields.forEach(field => {
                if (clientData[field] && clientData[field].toString().trim() !== '') {
                    phoneNumbers.push(clientData[field].toString().trim());
                }
            });
        }

        // Build email content
        const emailHTML = clientData ? `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
                <h2 style="color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px;">
                    📧 Solicitud de Contacto con Asesor
                </h2>
                
                <!-- DATOS DEL CLIENTE -->
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #667eea;">
                    <h3 style="color: #333; margin-top: 0;">👤 DATOS DEL CLIENTE</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">DOCUMENTO:</td>
                            <td style="padding: 8px 0; color: #333;">${dni}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">CLIENTE:</td>
                            <td style="padding: 8px 0; color: #333;">${clientData.NOMBRE_CLIENTE || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555; vertical-align: top;">TELÉFONOS:</td>
                            <td style="padding: 8px 0; color: #333;">
                                ${phoneNumbers.length > 0 ? phoneNumbers.join('<br>') : 'N/A'}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">CUENTA:</td>
                            <td style="padding: 8px 0; color: #333;">${clientData.CUENTA_CREDITO || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">TIPO:</td>
                            <td style="padding: 8px 0; color: #333;">${clientData.TIPO || 'N/A'}</td>
                        </tr>
                    </table>
                </div>

                <!-- INFORMACIÓN FINANCIERA -->
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #ffc107;">
                    <h3 style="color: #856404; margin-top: 0;">💰 INFORMACIÓN FINANCIERA</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #856404;">SALDO CAPITAL:</td>
                            <td style="padding: 8px 0; color: #333;">S/ ${parseFloat(clientData.SALDO_CAPITAL || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #856404;">SALDO CUOTA:</td>
                            <td style="padding: 8px 0; color: #333;">S/ ${parseFloat(clientData.SALDO_CUOTA || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #856404;">DÍAS ATRASO:</td>
                            <td style="padding: 8px 0; color: #333;">${clientData.DIAS_ATRASO || 0} días</td>
                        </tr>
                    </table>
                </div>

                <!-- CONSULTA DEL CLIENTE -->
                <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #17a2b8;">
                    <h3 style="color: #0c5460; margin-top: 0;">💬 CONSULTA DEL CLIENTE</h3>
                    <p style="background: white; padding: 15px; border-radius: 5px; color: #333; margin: 10px 0; font-size: 15px; line-height: 1.6;">
                        ${query}
                    </p>
                </div>

                <!-- FOOTER -->
                <div style="text-align: center; padding: 20px 0; border-top: 1px solid #ddd; margin-top: 30px;">
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        <strong>Fecha:</strong> ${new Date().toLocaleString('es-ES', { timeZone: 'America/Lima' })}
                    </p>
                    <p style="color: #999; font-size: 11px; margin: 5px 0;">
                        Este mensaje fue enviado automáticamente por el ChatBot de InformaPeru
                    </p>
                </div>
            </div>
        ` : `
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
        `;

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: 'coordinador.temprana@informaperu.com',
            cc: 'carlos.herrera@informaperu.com',
            subject: `Contacto Asesor - DNI ${dni}`,
            text: `El cliente con DNI: ${dni} solicita contacto.\n\nConsulta: ${query}\n\nFecha: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Lima' })}`,
            html: emailHTML
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Advisor email sent successfully:', info.messageId);
        console.log('   To:', mailOptions.to);
        console.log('   CC:', mailOptions.cc);
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
