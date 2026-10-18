FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/vercel-daemon.js ./scripts/vercel-daemon.js
ENV NODE_ENV=production
CMD ["node", "scripts/vercel-daemon.js"]
