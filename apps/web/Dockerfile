FROM node:20-alpine

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm install --legacy-peer-deps

COPY apps/web/ .
RUN node --experimental-require-module ./node_modules/.bin/npm run build

EXPOSE 3000
CMD ["node", "--experimental-require-module", "build/server/index.js"]