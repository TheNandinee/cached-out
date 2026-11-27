#!/bin/sh
set -e
PORT=${PORT:-8080}
sed "s/__PORT__/$PORT/" /srv/live/nginx.conf > /etc/nginx/http.d/default.conf
node /srv/live/server.js &
sleep 2 && PORT=$PORT node /srv/live/warmer.js &
exec nginx -g 'daemon off;'
