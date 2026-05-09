# ── Build stage ───────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps for python-magic and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libmagic-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.11-slim

LABEL maintainer="LUKA Virtual Office"
LABEL description="MCP Document Server — read/write Excel, Word, PDF"

# Runtime system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy source
COPY config.py server.py ./
COPY tools/ ./tools/
COPY utils/ ./utils/

# Create temp dir
RUN mkdir -p /tmp/mcp-docs

# Non-root user for security
RUN addgroup --system mcp && adduser --system --ingroup mcp mcpuser
RUN chown -R mcpuser:mcp /app /tmp/mcp-docs
USER mcpuser

EXPOSE 8100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/health')"

CMD ["python", "server.py"]
