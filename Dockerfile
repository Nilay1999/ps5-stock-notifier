FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Chromium and all OS-level dependencies it needs
RUN npx playwright install chromium --with-deps

COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/

RUN npm run build

ENV HEADLESS=true

CMD ["node", "dist/index.js"]
