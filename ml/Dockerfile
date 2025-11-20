FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git build-essential libgl1 \
    && rm -rf /var/lib/apt/lists/*
# Install system dependencies required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgtk2.0-dev \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir opencv-python-headless
RUN pip install ultralytics opencv-python-headless


COPY . .

CMD ["python", "main.py"]
