# Magic Vault

A web app for tracking your Magic: The Gathering collection.

## Prerequisites

See [PREREQUISITES.md](./PREREQUISITES.md) for assumed tools and experience.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [tRPC](https://trpc.io)
- [Prisma](https://prisma.io) + PostgreSQL
- [NextAuth](https://next-auth.js.org) — Google, Discord, GitHub, magic link
- [Tailwind CSS](https://tailwindcss.com)
- [Docker](https://docker.com) for local development

## Getting Started

```bash
npm run vercel:link      # link to the Vercel project
npm run vercel:env       # pull environment variables
npm install
npm run dev:docker       # start Next.js + Postgres + Mailcatcher
```

App runs at `http://localhost:3000`. Mailcatcher (magic link emails) at `http://localhost:1080`.

## Environment Variables

Pulled from Vercel with `npm run vercel:env`. See [.env.example](./.env.example) for the full list and `src/env.js` for validation.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_DONATION_URL` | No | Donation page (must be `https://`). Shows a "Support Magic Vault" link in the footer and on /about. Hidden when unset. |

## Scripts

| Command | Description |
|---|---|
| `npm run dev:docker` | Start full dev environment |
| `npm run dev:logs` | Tail docker compose logs |
| `npm run rebuild-frontend` | Rebuild Next.js container only |
| `npm test` | Run unit tests |
| `npm run test:debug` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema changes without migrations |
| `npm run studio` | Open Prisma Studio |

## Deployment

| Event | Result |
|---|---|
| Push to any branch | Vercel preview deployment |
| Merge to `main` | Vercel production deployment + migrations run via GitHub Action |
