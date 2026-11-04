FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server/index.mjs server/make-test.mjs server/make-report.mjs server/report-registry.mjs ./server/
COPY --chown=node:node server/fixtures ./server/fixtures
USER node
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "server/index.mjs"]
