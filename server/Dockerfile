FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server/index.mjs server/accounts.mjs server/cloud-reports.mjs server/xlsx-registration.mjs server/session-token.mjs server/mail-session.mjs server/make-test.mjs server/make-report.mjs server/report-registry.mjs ./server/
COPY --chown=node:node server/fixtures ./server/fixtures
COPY --chown=node:node shared ./shared
USER node
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "server/index.mjs"]
