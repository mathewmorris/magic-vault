ARG NODE_VERSION=18.20.4

FROM node:${NODE_VERSION}-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci

COPY src ./src
COPY public ./public
COPY next.config.js .
COPY tailwind.config.ts .
COPY postcss.config.cjs .
COPY tsconfig.json .

CMD npm run dev

