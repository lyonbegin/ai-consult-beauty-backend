FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./package.json
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./package.json
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3000
CMD ["npm","start"]
