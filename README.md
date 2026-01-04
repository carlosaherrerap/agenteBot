# 🤖 Chatbot de Cobranza - InformaPeru v2.0

Bot de WhatsApp para gestión de cobranzas con integración a SQL Server.

## 📋 Requisitos

- Node.js 18+
- SQL Server con base de datos `ContextBot` y tabla `BotHuancayo.Base`
- ODBC Driver 17 o 18 para SQL Server
- Redis (opcional - el bot funciona sin él usando memoria)

## 🚀 Instalación

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd agenteBot

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

## ⚙️ Configuración (.env)

### SQL Server con Autenticación de Windows
```env
SQL_HOST=WIN-HKBUI0ID607
SQL_USER=
SQL_PASSWORD=
SQL_DRIVER=ODBC Driver 17 for SQL Server
SQL_WINDOWS_AUTH=true
SQL_DATABASE=ContextBot
SQL_TABLE=BotHuancayo.Base
```

### SQL Server con Usuario/Contraseña
```env
SQL_HOST=192.168.18.117
SQL_USER=sa
SQL_PASSWORD=tu_contraseña
SQL_DRIVER=ODBC Driver 18 for SQL Server
SQL_DATABASE=ContextBot
SQL_TABLE=BotHuancayo.Base
```

### Redis (Opcional)
```env
# Si no tienes Redis instalado, el bot usará memoria automáticamente
REDIS_HOST=localhost
REDIS_PORT=6379
# Para desactivar Redis explícitamente:
# REDIS_ENABLED=false
```

## 🏃 Ejecución

```bash
npm start
# o para desarrollo:
npm run dev
```

## 📱 Uso

1. Abrir `http://localhost:3000`
2. Escanear QR con WhatsApp
3. Una vez conectado, ir al Dashboard

## 🔧 Verificar ODBC Driver

```powershell
# Ver drivers instalados
Get-OdbcDriver | Select-Object Name

# Si no tienes el driver, descargarlo de:
# https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
```

## 🔧 Instalar Redis (Opcional)

### Windows (con Docker)
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
redis-cli ping  # Debe responder PONG
```

### Verificar Redis
```bash
redis-cli ping
# Respuesta esperada: PONG
```

## 📊 Logs Esperados

```
╔════════════════════════════════════════════════════════╗
║  🤖 CHATBOT COBRANZA - INFORMAPERU v2.0              ║
╚════════════════════════════════════════════════════════╝
   DEBUG_LOGS: ACTIVADO

[SYSTEM] ℹ️ Verificando conexiones...
[SQL] ℹ️ Fase 1: Conectando al servidor...
[SQL] ✅ Conectado a 192.168.18.117
[SQL] ℹ️ Fase 2: Verificando base de datos...
[SQL] ✅ Base de datos: ContextBot
[SQL] ℹ️ Fase 3: Verificando tabla...
[SQL] ✅ Tabla encontrada: BotHuancayo.Base
[REDIS] ⚠️ No disponible - usando caché en memoria
[WHATSAPP] ✅ QR generado - Escanea con WhatsApp
```

## 📁 Estructura

```
agenteBot/
├── utils/
│   ├── sqlServer.js   # Conexión SQL Server
│   ├── redis.js       # Cache (Redis o memoria)
│   ├── logger.js      # Sistema de logs
│   ├── excel.js       # Guardar teléfonos nuevos
│   └── templates.js   # Mensajes del bot
├── services/
│   ├── deepseek.js    # AI (Ollama/Deepseek)
│   └── email.js       # Emails a asesores
├── public/            # Frontend Dashboard
├── flowEngine.js      # Lógica del chatbot
├── server.js          # Servidor Express
└── .env               # Configuración
```

## 📝 Licencia

MIT
