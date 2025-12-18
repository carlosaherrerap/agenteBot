# InformaPeru WhatsApp Chatbot

Chatbot automatizado para gestión de cobranzas utilizando WhatsApp (Baileys), **Deepseek API** (AI) y Gmail (Nodemailer).

> **Nota**: Este bot utiliza **Deepseek AI** directamente (NO usa OLLAMA ni Flowise). La API key de Deepseek se configura en el archivo `.env`.

## Requisitos Previos

- Node.js v18 o superior
- Docker & Docker Compose (Opcional, para ejecución en contenedor)
- Cuenta de Gmail con "Contraseña de Aplicación" habilitada.
- **API Key de Deepseek** ([https://platform.deepseek.com](https://platform.deepseek.com))

## Configuración

1.  Clona el repositorio.
2.  Crea un archivo `.env` basado en el siguiente ejemplo:

```env
DEEPSEEK_API_KEY=tu_api_key_aqui
GMAIL_USER=tu_correo@gmail.com
GMAIL_PASS=tu_app_password_aqui
PORT=3008
BOT_CONTEXT="Eres un asistente de cobranzas..."
```

### Cambiar el Modelo de AI

El bot está configurado para usar `deepseek-chat`. Si deseas cambiar el modelo:
1. Edita `services/deepseek.js`
2. Cambia la línea `model: 'deepseek-chat'` por el modelo que prefieras (ej: `deepseek-coder`)

Para usar un proveedor diferente (como OpenAI, Anthropic, etc.), necesitarás modificar el archivo `services/deepseek.js` con la URL y formato de la nueva API.

## Ejecución Local

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Inicia el servidor:
   ```bash
   npm start
   ```
3. Visita `http://localhost:3008/qr` para escanear el código QR con tu WhatsApp.

## Ejecución con Docker

Para una ejecución más aislada y estable (recomendado en producción o servidores remotos):

1. Construye e inicia el contenedor:
   ```bash
   docker-compose up -d --build
   ```
2. El servicio se reiniciará automáticamente si falla y puedes ver los logs con:
   ```bash
   docker-compose logs -f
   ```

## Notas de Estabilidad

- **Limpieza de Puerto**: El bot cierra correctamente el puerto al finalizar con `CTRL+C`.
- **Sesión Expirada**: Si la sesión falla (error 401), el bot limpiará automáticamente la carpeta `auth` y generará un nuevo QR.
- **Respuestas Inteligentes**: Utiliza el modelo `deepseek-chat` para respuestas más coherentes siguiendo el contexto proporcionado en el `.env`.
