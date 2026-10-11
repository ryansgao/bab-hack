FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package*.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY services/payments/package.json services/payments/package.json
RUN npm ci
COPY apps/frontend apps/frontend
RUN npm run build -w apps/frontend
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shared shared
COPY services services
COPY apps/simulation apps/simulation
COPY --from=frontend /build/apps/frontend/dist apps/frontend/dist
EXPOSE 8000
CMD ["uvicorn", "services.api:app", "--host", "0.0.0.0", "--port", "8000"]
