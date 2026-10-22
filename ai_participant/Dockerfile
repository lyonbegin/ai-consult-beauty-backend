FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY ai_participant/package.json ./package.json
RUN npm install --omit=dev
COPY ai_participant/src ./src
RUN npm run check

ENV NODE_ENV=production
CMD ["npm", "start"]
