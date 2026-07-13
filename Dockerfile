# Multi-stage Dockerfile: build frontend then build backend with LibreOffice

# 1) Build stage for frontend
FROM node:18-bullseye AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# 2) Final stage: Python + LibreOffice
FROM python:3.10-slim-bullseye

# Installer dépendances système (LibreOffice)
RUN apt-get update \
    && apt-get install -y \
       libreoffice-common \
       libreoffice-core \
       libreoffice-writer \
       fonts-dejavu-core \
       fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer dépendances Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copier la build frontend depuis le builder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copier le reste du code
COPY . /app

# Exécuter collectstatic (Django)
RUN python manage.py collectstatic --noinput

ENV PYTHONUNBUFFERED=1

# Commande de démarrage (modifiée)
CMD ["sh", "-c", "python manage.py migrate && gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT"]