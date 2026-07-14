FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && python3 -m venv /opt/crop-venv \
  && apt-get clean

COPY package.json package-lock.json ./
COPY packages/cloud-contracts/package.json packages/cloud-contracts/package.json
COPY packages/domain-catalog/package.json packages/domain-catalog/package.json
COPY services/wardrobe-api/package.json services/wardrobe-api/package.json
COPY services/image-crop-sidecar/requirements.txt services/image-crop-sidecar/requirements.txt

RUN npm ci --ignore-scripts
RUN /opt/crop-venv/bin/pip install --no-cache-dir -r services/image-crop-sidecar/requirements.txt

COPY packages/cloud-contracts packages/cloud-contracts
COPY packages/domain-catalog packages/domain-catalog
COPY services/wardrobe-api services/wardrobe-api
COPY services/image-crop-sidecar services/image-crop-sidecar

RUN npm --workspace @wardrobe/wardrobe-api run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PATH="/opt/crop-venv/bin:${PATH}"

WORKDIR /app/services/wardrobe-api
EXPOSE 3000

CMD ["npm", "run", "start"]
