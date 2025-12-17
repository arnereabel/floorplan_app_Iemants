FROM node:18-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Create data directory
RUN mkdir -p /app/data/shifts /app/data/workplaces

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
