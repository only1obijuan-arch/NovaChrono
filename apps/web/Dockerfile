FROM node:20-alpine

WORKDIR /app

COPY apps/web/package*.json apps/web/.npmrc ./
RUN npm install --legacy-peer-deps

COPY apps/web/ .
RUN NODE_OPTIONS=--experimental-require-module npm run build || true

RUN test -f build/server/index.js && echo "Build output verified" || (echo "No build output found" && exit 1)

EXPOSE 3000
CMD ["node", "build/server/index.js"]