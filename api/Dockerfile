FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Développement : le code est monté depuis la machine, tsx relance l'API à chaque modification
FROM deps AS dev
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "watch", "src/server.ts"]

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production : uniquement le JavaScript compilé et les dépendances d'exécution
FROM node:22-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
