-- ====================================
-- LEARNING SYSTEM TABLES FOR CHATBOT
-- Run this script on SQL Server (ContextBot database)
-- ====================================

-- Table: CONSULTAS_CRUDAS
-- Stores raw queries and responses with confidence scores
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CONSULTAS_CRUDAS')
CREATE TABLE CONSULTAS_CRUDAS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    consulta NVARCHAR(MAX) NOT NULL,
    respuesta NVARCHAR(MAX),
    confianza INT DEFAULT 2,  -- 0=inconforme, 1=conforme, 2=neutral
    fecha_creacion DATETIME DEFAULT GETDATE(),
    ultima_actualizacion DATETIME DEFAULT GETDATE()
);
GO

-- Table: REGEXP_QUERY
-- Stores regex patterns for automatic response matching
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'REGEXP_QUERY')
CREATE TABLE REGEXP_QUERY (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    id_consulta INT FOREIGN KEY REFERENCES CONSULTAS_CRUDAS(ID),
    exp_reg NVARCHAR(MAX) NOT NULL,
    tipo_consulta NVARCHAR(100),
    response NVARCHAR(MAX),
    prioridad INT DEFAULT 0,
    activo BIT DEFAULT 1,
    fecha_creacion DATETIME DEFAULT GETDATE()
);
GO

-- Table: HEAT_MESSAGE
-- Message classification by temperature/type
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'HEAT_MESSAGE')
CREATE TABLE HEAT_MESSAGE (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    message NVARCHAR(MAX) NOT NULL,
    temperatura NVARCHAR(50),  -- dni, cuenta, saludo, solicita_asesor, etc.
    jid NVARCHAR(100),
    fecha DATETIME DEFAULT GETDATE()
);
GO

-- Table: QUERYS
-- SQL queries associated with message types
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QUERYS')
CREATE TABLE QUERYS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    id_heat_message INT FOREIGN KEY REFERENCES HEAT_MESSAGE(ID),
    crud NVARCHAR(MAX) NOT NULL,
    descripcion NVARCHAR(200),
    activo BIT DEFAULT 1
);
GO

-- Table: ACEPT_EXPR_QUERYS
-- Accepted expression-query mappings
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ACEPT_EXPR_QUERYS')
CREATE TABLE ACEPT_EXPR_QUERYS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    id_regexp INT FOREIGN KEY REFERENCES REGEXP_QUERY(ID),
    id_query INT FOREIGN KEY REFERENCES QUERYS(ID),
    veces_usado INT DEFAULT 0,
    ultima_vez DATETIME DEFAULT GETDATE()
);
GO

-- ====================================
-- INSERT DEFAULT PATTERNS
-- ====================================

-- Greeting patterns
INSERT INTO REGEXP_QUERY (exp_reg, tipo_consulta, response, prioridad) VALUES
('(hola|buenas?|hey|saludos)', 'saludo', 'greeting', 10),
('(buenos?\s*d[ií]as?)', 'saludo', 'greeting_morning', 10),
('(buenas?\s*tardes?)', 'saludo', 'greeting_afternoon', 10),
('(buenas?\s*noches?)', 'saludo', 'greeting_night', 10);

-- Debt inquiry patterns
INSERT INTO REGEXP_QUERY (exp_reg, tipo_consulta, response, prioridad) VALUES
('(cuanto|cu[aá]nto)\s*(debo|pago)', 'consulta_deuda', 'debt_details', 8),
('(mi|la)\s*deuda', 'consulta_deuda', 'debt_details', 8),
('(saldo|monto)\s*(pendiente|total)?', 'consulta_deuda', 'debt_details', 7),
('d[ií]as?\s*(de\s*)?(atraso|mora)', 'consulta_atraso', 'debt_delay', 7);

-- Advisor request patterns
INSERT INTO REGEXP_QUERY (exp_reg, tipo_consulta, response, prioridad) VALUES
('(hablar|comunicar)\s*(con)?\s*(un\s*)?(asesor|humano|agente|persona)', 'solicita_asesor', 'transfer_advisor', 9),
('(necesito|quiero)\s*(un\s*)?(asesor|agente)', 'solicita_asesor', 'transfer_advisor', 9);

-- Menu option patterns
INSERT INTO REGEXP_QUERY (exp_reg, tipo_consulta, response, prioridad) VALUES
('^1$', 'menu_opcion', 'option_1_debt', 10),
('^2$', 'menu_opcion', 'option_2_offices', 10),
('^3$', 'menu_opcion', 'option_3_phone', 10),
('^4$', 'menu_opcion', 'option_4_advisor', 10);

-- Payment patterns
INSERT INTO REGEXP_QUERY (exp_reg, tipo_consulta, response, prioridad) VALUES
('(quiero|deseo|voy\s*a)\s*pagar', 'intencion_pago', 'payment_intent', 8),
('(c[oó]mo|donde|d[oó]nde)\s*(puedo\s*)?(pagar|cancelar)', 'como_pagar', 'payment_how', 8);

PRINT 'Learning tables created successfully!';
GO
