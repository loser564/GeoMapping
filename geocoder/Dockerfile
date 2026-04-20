FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY postal_geocoder.py .

# Data folder is mounted at runtime - see docker-compose.yml
VOLUME /data

CMD ["python", "postal_geocoder.py"]