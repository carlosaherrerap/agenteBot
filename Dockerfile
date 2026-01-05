# Dockerfile para desarrollo local SIN SQL Server nativo
# Para producción en Windows, ejecutar directamente con npm start

FROM node:20-alpine

# No se puede usar msnodesqlv8 en Alpine Linux (requiere ODBC)
# Este Dockerfile es solo para Redis y testing

WORKDIR /app

# Solo copiar package.json sin msnodesqlv8
COPY package*.json ./

# Instalar dependencias (ignorar errores de msnodesqlv8)
RUN npm install --ignore-scripts || true

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
