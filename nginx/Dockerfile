# Compila el frontend y lo sirve con nginx junto al proxy de la API.
# Contexto de build: la raíz del proyecto (ver docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Historial de cambios (pantalla Acerca de): vite.config.js lo busca en ../CHANGELOG.md
COPY CHANGELOG.md /CHANGELOG.md
# Versión instalada (la pasa `make deploy` desde el tag de git)
ARG APP_VERSION=dev
ENV VITE_API_URL=/api VITE_APP_VERSION=$APP_VERSION
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
