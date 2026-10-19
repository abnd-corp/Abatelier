FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Développement : serveur Vite avec rechargement à chaud, le code est monté depuis la machine
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["node_modules/.bin/vite", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
RUN npm run build

# Production : fichiers statiques servis par nginx, sans droits root
FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
