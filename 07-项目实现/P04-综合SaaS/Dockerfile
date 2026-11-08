FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8797
CMD ["sh", "-c", "node scripts/migrate.mjs && node src/server.js"]
