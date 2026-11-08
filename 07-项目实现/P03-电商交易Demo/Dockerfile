FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8796
CMD ["sh", "-c", "node scripts/migrate.mjs && node src/server.js"]
