FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY package*.json .

RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

COPY . .

EXPOSE 50051
CMD ["npm", "run", "serve"]
