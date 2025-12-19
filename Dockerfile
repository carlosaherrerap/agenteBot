FROM node:20-alpine

# Install build dependencies for some npm packages if needed
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Expose the configured port
EXPOSE 3008

# Use custom entrypoint that cleans auth folder
ENTRYPOINT ["./docker-entrypoint.sh"]
