FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    pkg-config \
    libtool \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev && \
    npm cache clean --force

COPY . .

ENV NODE_ENV=production

CMD ["node", "--expose-gc", "src/index.js"]
