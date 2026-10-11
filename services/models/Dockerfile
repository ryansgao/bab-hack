FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir 'transformers>=4.48,<5'
COPY shared shared
COPY services services
COPY apps/simulation apps/simulation
ENV TORCH_HOME=/app/data/torch HF_HOME=/app/data/huggingface
CMD ["uvicorn", "services.models.app:app", "--host", "0.0.0.0", "--port", "8001"]
