FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY example-service-real-api.yaml ./
COPY mocks/ mocks/
COPY scripts/ scripts/

ENV PORT=4010
ENV HOST=0.0.0.0
EXPOSE 4010

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4010/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "mocks/gateway/index.js"]
