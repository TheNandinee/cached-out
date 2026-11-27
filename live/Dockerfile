FROM node:20-alpine
RUN apk add --no-cache nginx && mkdir -p /var/cache/nginx /run/nginx && chown -R nginx:nginx /var/cache/nginx
WORKDIR /srv
COPY package*.json ./
RUN npm install --omit=dev
COPY live ./live
COPY app/headlines.json ./live/headlines.json
CMD ["sh", "live/start.sh"]
