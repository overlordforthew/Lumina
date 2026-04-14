# ─── Build stage: compile React JSX → plain JS ───
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY src/ ./src/
RUN npx esbuild src/app.jsx --bundle --outfile=public/app.js \
    --define:process.env.NODE_ENV='"production"' --minify

# ─── Production stage: just the server + built files ───
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY server.js setup-db.js ./
COPY public/ ./public/
COPY --from=builder /app/public/app.js ./public/app.js

EXPOSE 3456

CMD ["node", "server.js"]
