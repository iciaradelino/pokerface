FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src/ ./src/
COPY --chown=node:node migrations/ ./migrations/
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
