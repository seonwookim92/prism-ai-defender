# Use Node.js for Next.js build
FROM node:20-slim AS base

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy all files
COPY . .

# Build Next.js
# Note: We don't need prisma generate since we removed the prisma dependency in the code
RUN npm run build

# Runtime stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy build artifacts and binaries
COPY --from=base /app/next.config.js ./
COPY --from=base /app/public ./public
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

EXPOSE 3000

# Start Next.js
CMD ["npm", "run", "start"]
