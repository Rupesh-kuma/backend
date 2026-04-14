FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

# Create dirs
RUN mkdir -p uploads logs

EXPOSE 5000

CMD ["node", "src/server.js"]
