# Frontend Dockerfile - Multi-stage build for Vite React app

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Site branding. Vite inlines VITE_* values into the bundle at build time, so
# these must be present here rather than at container start. Unset values fall
# back to the neutral defaults in vite.config.ts / src/config.ts.
ARG VITE_SITE_NAME
ARG VITE_SITE_TAGLINE
ARG VITE_SITE_DESCRIPTION
ENV VITE_SITE_NAME=$VITE_SITE_NAME \
    VITE_SITE_TAGLINE=$VITE_SITE_TAGLINE \
    VITE_SITE_DESCRIPTION=$VITE_SITE_DESCRIPTION

# Overlay deployment-specific branding if it was provided. public/branding/ is
# gitignored, so a deployment drops its own logo there once and it survives
# every future git pull; a plain clone just keeps the placeholder logo.
RUN if [ -f public/branding/logo.png ]; then cp public/branding/logo.png public/logo.png; fi

# Build the app
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine AS production

# Server config. The templates are rendered by the base image's envsubst
# entrypoint at container start; the shared snippet is copied verbatim so the
# nginx runtime variables inside it are never substituted.
COPY nginx-app.conf /etc/nginx/snippets/app.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx.http.conf.template /etc/nginx/templates-http/default.conf.template

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
