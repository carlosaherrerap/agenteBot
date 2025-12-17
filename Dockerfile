FROM node:20-alpine

# Install build dependencies for some npm packages if needed
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose the configured port
EXPOSE 3008

CMD ["npm", "start"]
