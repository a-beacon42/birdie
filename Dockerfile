# =============================================================
# Stage 1 — Build the Expo web frontend
# =============================================================
FROM node:22-slim AS frontend

WORKDIR /frontend

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the frontend source
COPY app.json babel.config.js tsconfig.json ./
COPY app/ ./app/
COPY assets/ ./assets/
COPY src/ ./src/

# Build the static web export.
# BACKEND_URL is intentionally empty so API calls use relative paths (same origin).
RUN echo 'BACKEND_URL=\nBACKEND_API_KEY=' > .env \
    && npx expo export --platform web

# =============================================================
# Stage 2 — Python API + static web files
# =============================================================
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/app/ ./app/

# Copy the Expo web build from stage 1
COPY --from=frontend /frontend/dist ./static

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Expose port 8000 (Azure Container Apps will route to this)
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
