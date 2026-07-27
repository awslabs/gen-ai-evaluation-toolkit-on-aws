# Platform must match expected OS/architecture that runs in ECS
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:24

# For debugging
RUN node --version
RUN npm --version

# Copy files and run commands in /app
WORKDIR /app

# Copy SDK to match lockfile's expected relative path (../plugin-gen-sdk from /app = /plugin-gen-sdk)
COPY plugin-gen-sdk /plugin-gen-sdk

# Install dependencies - no path modification needed, lockfile paths resolve correctly
COPY plugin-gen-rag/package.json plugin-gen-rag/package-lock.json ./

RUN npm ci

# Copy source code and TypeScript config
COPY plugin-gen-rag/src ./src
COPY plugin-gen-rag/tsconfig.json .

# Build TS into JS
RUN npx tsc

# Create non-root user for runtime security
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs appuser && chown -R appuser:nodejs /app /plugin-gen-sdk

# Switch to non-root user
USER appuser

CMD ["npm", "start"]
