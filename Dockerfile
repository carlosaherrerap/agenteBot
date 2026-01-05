FROM node:20-slim

# Set environment variables for non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install prerequisites
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# 2. Add Microsoft GPG key and Repository (Optional but recommended for SQL tools)
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,arm64,armhf signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list

# 3. Install ODBC Driver 18 for SQL Server and dev headers
RUN apt-get update && ACCEPT_EULA=Y apt-get install -y \
    msodbcsql18 \
    unixodbc-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# 4. Remove Windows-only dependency before installing
# msnodesqlv8 is only for Windows; Linux uses the pure JS 'tedious' driver (default in mssql package)
RUN sed -i '/msnodesqlv8/d' package.json && npm install --omit=dev

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
