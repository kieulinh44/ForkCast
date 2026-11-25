FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FORKCAST_DB_PATH=/data/forkcast.sqlite3
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 --create-home forkcast \
    && mkdir /data && chown forkcast:forkcast /data
COPY backend/ ./backend/
COPY index.html app.js state.js styles.css server-state.js ./
COPY assets/*.svg ./assets/
USER forkcast
VOLUME ["/data"]
EXPOSE 8014
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8014/api/health', timeout=4)" || exit 1
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8014", "--workers", "1", "--no-access-log"]
