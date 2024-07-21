ARG NODE_VERSION=18.20.4

FROM node:${NODE_VERSION}-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY src ./src
COPY prisma ./prisma
COPY public ./public
COPY next.config.js .
COPY tailwind.config.ts .
COPY postcss.config.cjs .
COPY tsconfig.json .

RUN npm run db:gen

CMD npm run dev

