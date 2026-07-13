# Dockerfile pour déployer l'application avec LibreOffice pour conversion DOCX->PDF
FROM python:3.10-slim

# Installer dépendances système et LibreOffice
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       libsecret-1-0 \
       fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier fichiers et installer dépendances Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]
