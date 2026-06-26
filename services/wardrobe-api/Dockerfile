FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/cloud-contracts/package.json packages/cloud-contracts/package.json
COPY services/wardrobe-api/package.json services/wardrobe-api/package.json

RUN npm ci

COPY packages/cloud-contracts packages/cloud-contracts
COPY services/wardrobe-api services/wardrobe-api

RUN npm --workspace @wardrobe/wardrobe-api run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app/services/wardrobe-api
EXPOSE 3000

CMD ["npm", "run", "start"]
