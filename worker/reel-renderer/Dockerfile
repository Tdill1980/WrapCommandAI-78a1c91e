# Self-hosted ffmpeg reel renderer.
# ffmpeg (with libx264 + freetype/drawtext) and the DejaVu fonts are the only
# system deps; everything else is Node.
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
