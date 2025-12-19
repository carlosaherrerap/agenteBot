-- ====================================
-- CHATBOT DATABASE INITIALIZATION
-- ====================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================
-- TABLE: entidades_financieras
-- ====================================
CREATE TABLE IF NOT EXISTS entidades_financieras (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL UNIQUE,
    codigo VARCHAR(50),
    direccion TEXT,
    telefono VARCHAR(50),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default entity
INSERT INTO entidades_financieras (nombre, codigo) VALUES 
    ('Caja Huancayo', 'CAJA_HUANCAYO')
ON CONFLICT (nombre) DO NOTHING;

-- ====================================
-- TABLE: oficinas
-- ====================================
CREATE TABLE IF NOT EXISTS oficinas (
    id SERIAL PRIMARY KEY,
    entidad_id INTEGER REFERENCES entidades_financieras(id) ON DELETE CASCADE,
    nombre VARCHAR(200) NOT NULL,
    departamento VARCHAR(100),
    provincia VARCHAR(100),
    distrito VARCHAR(100),
    direccion TEXT,
    telefono VARCHAR(50),
    horario VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample offices
INSERT INTO oficinas (entidad_id, nombre, departamento, provincia, direccion, telefono, horario) VALUES 
    (1, 'Oficina Principal Huancayo', 'JUNIN', 'HUANCAYO', 'Calle Real 123, Huancayo', '064-123456', 'Lun-Vie: 8:30am-6:00pm, Sáb: 9:00am-1:00pm'),
    (1, 'Agencia La Merced', 'JUNIN', 'CHANCHAMAYO', 'Jr. Libertad 456, La Merced', '064-789012', 'Lun-Vie: 9:00am-5:00pm')
ON CONFLICT DO NOTHING;

-- ====================================
-- TABLE: clientes (deudores)
-- ====================================
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    cuenta VARCHAR(50) NOT NULL UNIQUE,
    dni VARCHAR(20),
    ruc VARCHAR(20),
    nombre_completo VARCHAR(300) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(100),
    departamento VARCHAR(100),
    provincia VARCHAR(100),
    distrito VARCHAR(100),
    direccion TEXT,
    fecha_registro DATE,
    estado_cliente VARCHAR(50) DEFAULT 'ACTIVO',
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clientes_dni ON clientes(dni);
CREATE INDEX IF NOT EXISTS idx_clientes_cuenta ON clientes(cuenta);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre_completo);

-- Insert sample client from the image
INSERT INTO clientes (fecha_registro, cuenta, dni, ruc, nombre_completo, telefono, departamento) VALUES 
    ('2025-12-17', '107004101009007467', '20533553', '.', 'VILCA GUILLERMO, ILMA', '988676939', 'JUNIN')
ON CONFLICT (cuenta) DO NOTHING;

-- ====================================
-- TABLE: deudas
-- ====================================
CREATE TABLE IF NOT EXISTS deudas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    entidad_id INTEGER REFERENCES entidades_financieras(id) ON DELETE CASCADE,
    cuenta VARCHAR(50) NOT NULL,
    tipo_credito VARCHAR(100),  -- Personal, Empresarial, Vehicular, etc.
    monto_original DECIMAL(15, 2) NOT NULL,
    monto_actual DECIMAL(15, 2) NOT NULL,
    monto_mora DECIMAL(15, 2) DEFAULT 0,
    interes_acumulado DECIMAL(15, 2) DEFAULT 0,
    dias_mora INTEGER DEFAULT 0,
    fecha_desembolso DATE,
    fecha_vencimiento DATE,
    fecha_ultimo_pago DATE,
    estado_deuda VARCHAR(50) DEFAULT 'VIGENTE',  -- VIGENTE, VENCIDA, LITIGIO, PAGADA
    cuotas_totales INTEGER,
    cuotas_pagadas INTEGER DEFAULT 0,
    cuotas_vencidas INTEGER DEFAULT 0,
    descuento_disponible DECIMAL(5, 2) DEFAULT 0,  -- Porcentaje de descuento
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deudas_cliente ON deudas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_deudas_cuenta ON deudas(cuenta);
CREATE INDEX IF NOT EXISTS idx_deudas_estado ON deudas(estado_deuda);

-- Insert sample debt for the client
INSERT INTO deudas (
    cliente_id, 
    entidad_id, 
    cuenta, 
    tipo_credito, 
    monto_original, 
    monto_actual, 
    monto_mora,
    interes_acumulado,
    dias_mora,
    fecha_desembolso,
    fecha_vencimiento,
    estado_deuda,
    cuotas_totales,
    cuotas_pagadas,
    cuotas_vencidas,
    descuento_disponible
) VALUES (
    (SELECT id FROM clientes WHERE dni = '20533553'),
    1,
    '107004101009007467',
    'Crédito Personal',
    5000.00,
    4250.00,
    850.00,
    320.50,
    45,
    '2024-06-15',
    '2025-06-15',
    'VENCIDA',
    12,
    7,
    5,
    15.00
);

-- ====================================
-- TABLE: usuarios (sistema)
-- ====================================
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200),
    email VARCHAR(100),
    rol VARCHAR(50) DEFAULT 'AGENTE',  -- ADMIN, AGENTE, SUPERVISOR
    activo BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin123)
-- In production, you should hash this password properly
INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol) VALUES 
    ('admin', '$2a$10$YourHashedPasswordHere', 'Administrador Sistema', 'admin@informaperu.com', 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- ====================================
-- TABLE: conversaciones
-- ====================================
CREATE TABLE IF NOT EXISTS conversaciones (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    telefono_whatsapp VARCHAR(50) NOT NULL,
    dni_proporcionado VARCHAR(20),
    mensaje_cliente TEXT,
    respuesta_bot TEXT,
    intent VARCHAR(100),  -- SALUDO, CONSULTA_DEUDA, SOLICITA_ASESOR, etc.
    derivado_asesor BOOLEAN DEFAULT FALSE,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversaciones_cliente ON conversaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_telefono ON conversaciones(telefono_whatsapp);
CREATE INDEX IF NOT EXISTS idx_conversaciones_fecha ON conversaciones(fecha_hora);

-- ====================================
-- FUNCTIONS AND TRIGGERS
-- ====================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deudas_updated_at BEFORE UPDATE ON deudas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oficinas_updated_at BEFORE UPDATE ON oficinas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entidades_updated_at BEFORE UPDATE ON entidades_financieras
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- GRANT PERMISSIONS
-- ====================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;

-- ====================================
-- INITIAL DATA SUMMARY
-- ====================================
SELECT 
    'Database initialized successfully!' as message,
    (SELECT COUNT(*) FROM clientes) as total_clientes,
    (SELECT COUNT(*) FROM deudas) as total_deudas,
    (SELECT COUNT(*) FROM oficinas) as total_oficinas,
    (SELECT COUNT(*) FROM entidades_financieras) as total_entidades;
