
FROM node:22-alpine

WORKDIR /app

ARG APP_VERSION=v1
ENV APP_VERSION=${APP_VERSION}
ENV PORT=3000

COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
