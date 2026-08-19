FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Python + OpenCV headless for panorama stitching
RUN apk add --no-cache python3 py3-pip py3-numpy && \
    pip3 install --no-cache-dir --break-system-packages opencv-python-headless==4.10.0.84

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node . .
USER node

EXPOSE 5000
CMD ["node", "src/server.js"]
