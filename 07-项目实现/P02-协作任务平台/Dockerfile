FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 3102
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
