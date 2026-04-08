# Używamy wersji slim dla mniejszego rozmiaru i szybkości
FROM python:3.11-slim

# Ustawiamy katalog roboczy
WORKDIR /app

# Instalujemy zależności systemowe (jeśli będą potrzebne w przyszłości)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Kopiujemy wymagania i instalujemy biblioteki
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiujemy kod aplikacji
COPY . .

# Odpalamy FastAPI za pomocą Uvicorn
# --proxy-headers jest ważne, bo działamy za Caddy
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
