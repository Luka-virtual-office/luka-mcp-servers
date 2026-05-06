FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3002
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
