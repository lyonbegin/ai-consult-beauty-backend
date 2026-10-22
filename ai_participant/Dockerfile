FROM node:22-bookworm

WORKDIR /app/ai_participant
COPY ai_participant/package.json ./package.json
RUN npm install
RUN npx playwright install --with-deps chromium

COPY ai_participant/ ./
RUN npm run build

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
