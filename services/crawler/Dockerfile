# Multi-stage Dockerfile for NetCrawl
FROM python:3.12-slim AS base

# Install system utilities and security updates
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create application directories
RUN mkdir -p /app/data /app/snapshots /app/maps /app/logs/raw_responses

# Copy application source code
COPY netcrawl/ ./netcrawl/
COPY main.py config.yaml ./

# Run as non-privileged application user for security
RUN useradd -u 1001 -m -s /bin/bash netcrawl && \
    chown -R netcrawl:netcrawl /app

USER netcrawl

# Expose Web Interface port
EXPOSE 8080

# Default entrypoint runs the web interface
CMD ["python", "main.py", "web", "--host", "0.0.0.0", "--port", "8080"]
