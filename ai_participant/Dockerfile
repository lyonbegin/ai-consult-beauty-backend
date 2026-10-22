FROM node:22-bookworm-slim

WORKDIR /app
COPY ai_participant/package.json ./package.json
RUN npm install --omit=dev
COPY ai_participant/src ./src

ENV NODE_ENV=production
CMD ["npm", "start"]
