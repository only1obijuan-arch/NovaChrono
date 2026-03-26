FROM node:18-alpine

WORKDIR /app

COPY . .
RUN npm install --legacy-peer-deps
RUN npm run build

EXPOSE 3000
CMD ["node", "build/server/index.js"]