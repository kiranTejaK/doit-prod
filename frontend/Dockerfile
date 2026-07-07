# Stage 0: Build stage using an LTS Alpine-based Node image
FROM node:22-alpine AS build-stage

# Avoid downloading Playwright browsers which bloat the image and slow down builds
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Only copy package files first to leverage Docker caching
COPY package*.json ./

# Install dependencies cleanly and clear the cache in the same layer
RUN npm ci && npm cache clean --force

# Copy the rest of the app code
COPY . .

# Vite bakes in environment variables during the build.
# ARG is sufficient here; ENV is redundant and could leak into intermediate image states unnecessarily.
ARG VITE_API_URL

RUN npm run build

# Stage 1: Production stage using a lightweight Alpine-based Nginx image
FROM nginx:alpine

# Copy compiled assets from build stage
COPY --from=build-stage /app/dist/ /usr/share/nginx/html

# Copy configurations
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx-backend-not-found.conf /etc/nginx/extra-conf.d/backend-not-found.conf
