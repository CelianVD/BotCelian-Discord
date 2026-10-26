FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Remplace "index.js" par le nom de ton fichier principal (bot.js, main.js...)
CMD ["node", "index.js"] 
