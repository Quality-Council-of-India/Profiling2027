FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma

RUN npx prisma generate

COPY src ./src
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && \
    npm install -g pm2

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["pm2-runtime", "start", "src/server.js", "--name", "profiling2027-api"]
