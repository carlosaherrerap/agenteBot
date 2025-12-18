# Guía: Cambiar de Deepseek a OLLAMA

## ¿Qué es OLLAMA?

OLLAMA es una herramienta que te permite ejecutar modelos de lenguaje **localmente** en tu PC, sin necesidad de API keys ni conexión a internet (después de descargar los modelos).

## Instalación de OLLAMA

1. Descarga OLLAMA desde: https://ollama.ai
2. Instala y ejecuta OLLAMA en tu PC
3. Descarga un modelo (en la terminal):
   ```bash
   ollama pull llama3.2
   ```

## Configuración en el Bot

### Paso 1: Editar `services/deepseek.js`

Ya he agregado comentarios en el archivo. Para activar OLLAMA:

1. **Cambiar URL** (línea ~14):
   ```javascript
   // Comentar esta línea:
   // const url = 'https://api.deepseek.com/v1/chat/completions';
   
   // Descomentar esta línea:
   const url = 'http://localhost:11434/api/chat';
   ```

2. **Cambiar Modelo** (línea ~21):
   ```javascript
   // Comentar:
   // model: 'deepseek-chat',
   
   // Descomentar uno de estos:
   model: 'llama3.2',     // Recomendado
   // model: 'mistral',
   // model: 'phi3',
   ```

3. **Cambiar Headers** (línea ~43):
   ```javascript
   // Comentar el bloque de Deepseek:
   // const headers = {
   //     'Content-Type': 'application/json',
   //     Authorization: `Bearer ${apiKey}`
   // };
   
   // Descomentar el bloque de OLLAMA:
   const headers = {
       'Content-Type': 'application/json'
   };
   ```

4. **Cambiar Response Format** (línea ~54):
   ```javascript
   // Comentar:
   // const result = response.data?.choices?.[0]?.message?.content || '';
   
   // Descomentar:
   const result = response.data?.message?.content || '';
   ```

### Paso 2: Actualizar `.env` (Opcional)

Puedes eliminar o comentar la línea de `DEEPSEEK_API_KEY` si solo usarás OLLAMA:
```env
# DEEPSEEK_API_KEY=sk-d9a33f43c79d4e859475f7d264dd82a9
GMAIL_USER=carlos.a.h.palma@gmail.com
GMAIL_PASS=InformaPeru2025$$
PORT=3008
BOT_CONTEXT="..."
```

## Modelos OLLAMA Recomendados

| Modelo | Tamaño | Uso Recomendado |
|--------|--------|-----------------|
| `llama3.2` | ~2GB | Conversacional, rápido |
| `mistral` | ~4GB | Bueno para español |
| `phi3` | ~2.3GB | Compacto y eficiente |
| `qwen2.5` | Variable | Multilingüe |
| `gemma2` | ~5GB | Alta calidad |

## Ventajas y Desventajas

### OLLAMA (Local)
✅ Gratis, sin límites de API  
✅ Privacidad total (datos no salen de tu PC)  
✅ Sin conexión a internet (después de descargar)  
❌ Requiere recursos de PC (3-8GB RAM según modelo)  
❌ Respuestas pueden ser más lentas  

### Deepseek (Cloud)
✅ Rápido y eficiente  
✅ No consume recursos locales  
❌ Requiere API key y pago  
❌ Límites de uso según plan  

## Verificación

Después de hacer los cambios:
1. Asegúrate de que OLLAMA esté ejecutándose
2. Reinicia el bot: `npm start`
3. Envía un mensaje de prueba
