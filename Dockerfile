# Multi-stage build for optimal size
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init=1.2.5-r4

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production node_modules from builder (avoids npm ci issues with QEMU)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Remove dev dependencies to reduce image size, then drop the global npm CLI.
# npm is only needed at build time; the runtime starts with `node dist/index.js`,
# so removing it strips build-tooling CVEs (tar, picomatch, ip-address, …) that
# Trivy would otherwise flag in /usr/local/lib/node_modules/npm.
RUN npm prune --production && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy configuration examples
COPY config/config.example.json ./config/

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose stdio
EXPOSE 3000

# Add healthcheck for monitoring
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD node -e "process.exit(0)" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]