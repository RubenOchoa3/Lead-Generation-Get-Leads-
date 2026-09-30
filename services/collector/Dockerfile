FROM python:3.12-slim
WORKDIR /app
COPY services/collector/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY services /app/services
COPY pipeline /app/pipeline
ENV PYTHONPATH=/app
CMD ["sh", "-c", "uvicorn services.collector.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
