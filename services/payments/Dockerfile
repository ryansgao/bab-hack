FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY services/payments/package.json services/payments/package.json
RUN npm ci
COPY services/payments services/payments
CMD ["node", "--import", "tsx", "services/payments/src/server.ts"]
