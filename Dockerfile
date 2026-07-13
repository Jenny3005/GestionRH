# Multi-stage Dockerfile: build frontend then build backend with LibreOffice

# 1) Build stage for frontend
FROM node:18-bullseye AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# 2) Final stage: Python + LibreOffice
FROM python:3.10-slim

# Installer dépendances système et LibreOffice
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       libsecret-1-0 \
       fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer dépendances Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copier la build frontend depuis le builder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copier le reste du code
COPY . /app

ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]
