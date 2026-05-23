FROM node:20-slim

# Install necessary dependencies for building native modules and handling media
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

# Install production dependencies and clean cache to reduce image size
RUN npm install --omit=dev && \
    npm cache clean --force

COPY . .

# Set environment variables
ENV NODE_ENV=production

CMD ["npm", "start"]
