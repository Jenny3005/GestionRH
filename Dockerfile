# Multi-stage Dockerfile: build frontend then build backend with LibreOffice

# 1) Build stage for frontend
FROM node:20-bullseye AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# 2) Final stage: Python + LibreOffice
FROM python:3.12-slim-bullseye  # ← Python 3.12

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y \
       libreoffice-common \
       libreoffice-core \
       libreoffice-writer \
       fonts-dejavu-core \
       fonts-liberation \
       pkg-config \
       default-libmysqlclient-dev \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

COPY . /app

RUN python manage.py collectstatic --noinput

ENV PYTHONUNBUFFERED=1

CMD ["sh", "-c", "python manage.py migrate && gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT"]