FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

EXPOSE 5000
CMD ["npm", "run", "dev"]
