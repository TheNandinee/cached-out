FROM node:20-alpine
WORKDIR /srv
COPY package*.json ./
RUN npm install --omit=dev
COPY app ./app
CMD ["node", "app/server.js"]
