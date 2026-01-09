-- ====================================
-- FAQ SYSTEM TABLES FOR CHATBOT
-- Run this script on SQL Server (ContextBot database)
-- ====================================

-- Table: FAQ_RESPUESTAS
-- Stores frequently asked questions with keywords and responses
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FAQ_RESPUESTAS')
CREATE TABLE FAQ_RESPUESTAS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    pregunta NVARCHAR(500) NOT NULL,           -- Original question
    palabras_clave NVARCHAR(500) NOT NULL,     -- Keywords separated by comma
    respuesta NVARCHAR(MAX) NOT NULL,          -- Base response
    categoria NVARCHAR(100) DEFAULT 'general', -- Category (deuda, pago, oficinas, etc.)
    activo BIT DEFAULT 1,
    veces_usado INT DEFAULT 0,
    fecha_creacion DATETIME DEFAULT GETDATE(),
    ultima_actualizacion DATETIME DEFAULT GETDATE()
);
GO

-- ====================================
-- INSERT DEFAULT FAQs
-- ====================================

INSERT INTO FAQ_RESPUESTAS (pregunta, palabras_clave, respuesta, categoria) VALUES
('¿Cómo puedo reprogramar mi deuda?', 
 'reprogramar,deuda,refinanciar,reestructurar,cuota,pagar', 
 'Para reprogramar tu deuda, debes acercarte a una de nuestras oficinas con tu DNI. Un asesor evaluará tu caso y te ofrecerá las mejores opciones de pago.', 
 'deuda'),

('¿Cuáles son los horarios de atención?', 
 'horario,atencion,hora,abierto,cerrado,cuando,abren', 
 'Nuestros horarios son: Huancayo Centro y El Tambo: Lun-Sab 8:00am - 6:00pm. Junín-Tarma: Lun-Vie 9:00am - 5:00pm.', 
 'oficinas'),

('¿Dónde puedo pagar mi cuota?', 
 'donde,pagar,cuota,pago,lugar,agente', 
 'Puedes pagar en cualquiera de nuestras oficinas de Caja Huancayo, agentes corresponsales, o mediante banca móvil/internet.', 
 'pago'),

('¿Qué pasa si no pago mi cuota?', 
 'no,pago,pagar,consecuencia,mora,atraso,intereses', 
 'Si no pagas tu cuota a tiempo, se generarán intereses moratorios y tu historial crediticio puede verse afectado. Te recomendamos comunicarte con un asesor para encontrar una solución.', 
 'deuda'),

('¿Cómo puedo saber mi saldo?', 
 'saldo,cuanto,debo,deuda,monto,total', 
 'Para conocer tu saldo actual, puedes consultarlo aquí mismo escribiendo tu DNI. Te mostraré tu saldo capital, cuota pendiente y días de atraso.', 
 'deuda'),

('¿Puedo pagar en partes?', 
 'partes,cuotas,fraccionar,dividir,parcial', 
 'Sí, puedes negociar un plan de pagos. Para ello, te recomendamos comunicarte con un asesor que evaluará tu situación y te ofrecerá opciones personalizadas.', 
 'pago'),

('¿Cómo contacto a un asesor?', 
 'asesor,contactar,llamar,hablar,humano,persona,ayuda', 
 'Para contactar a un asesor, escribe tu DNI y tu consulta en un solo mensaje. Por ejemplo: "12345678, necesito reprogramar mi deuda". Te derivaremos con un asesor personalizado.', 
 'asesor'),

('¿Cuáles son las oficinas más cercanas?', 
 'oficina,cercana,direccion,ubicacion,ir,donde', 
 'Nuestras oficinas principales están en: Huancayo Centro (Jr. Real 789, Plaza Constitución), El Tambo (Av. Huancavelica 321), y Tarma (Jr. Lima 555).', 
 'oficinas');

GO

-- ====================================
-- ADDITIONAL FAQs - User Requested
-- ====================================

INSERT INTO FAQ_RESPUESTAS (pregunta, palabras_clave, respuesta, categoria) VALUES
('Quiero reprogramar mi deuda', 
 'reprogramar,reestructurar,refinanciar,negociar,cambiar,cuotas,plazos', 
 'Te entiendo. Para ello te voy a derivar con un asesor. Brindame tu DNI y consulta breve (ejemplo: 75747335, necesito reprogramar mi deuda)', 
 'asesor'),

('¿Cuánto es mi saldo capital?', 
 'saldo,capital,prestamo,total,inicial,debo,deuda', 
 'Tu saldo capital es el monto total de tu préstamo. Para consultarlo, escríbeme tu DNI y te lo mostraré al instante.', 
 'deuda'),

('¿Cuánto es mi próxima cuota?', 
 'cuota,proxima,siguiente,pago,mensual,pagar', 
 'Tu cuota pendiente es el monto que debes pagar este mes. Para consultarlo, escríbeme tu DNI y te lo mostraré.', 
 'pago'),

('¿Cuántos días de atraso tengo?', 
 'dias,atraso,mora,atrasado,tiempo,demorado,vencido', 
 'Puedo mostrarte tus días de atraso y la fecha en que debiste pagar. Escríbeme tu DNI para darte esa información.', 
 'deuda'),

('Deseo pagar mi deuda', 
 'pagar,deuda,quiero,deseo,cancelar,abonar', 
 'De acuerdo, para ello te voy a derivar con un asesor. Brindame tu DNI y consulta breve (ejemplo: 75747335, necesito pagar mi deuda)', 
 'asesor');

GO

PRINT 'FAQ tables created and populated successfully!';
GO

