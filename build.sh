#!/bin/bash
set -e

echo "Installing system dependencies for PDF conversion..."

# Update package manager
apt-get update

# Install LibreOffice and unoconv
apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    unoconv \
    fonts-dejavu-core \
    msttcorefonts

# Clean up apt cache
rm -rf /var/lib/apt/lists/*

echo "System dependencies installed successfully!"

# Run normal Render build process
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python manage.py collectstatic --noinput
python manage.py migrate
