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
| `AFFILIATE_LINKS` | No | `on` or `off` (default `off`). Turns affiliate tracking on buy links on or off. While off, buy links use Scryfall's own store links and no disclosure shows. Redeploy after changing it. |
| `TCGPLAYER_AFFILIATE_URL` | No | TCGplayer tracking link from Impact (must be `https://`), like `https://partner.tcgplayer.com/c/<account>/<ad>/21018`. The product page goes on the end as `?u=`. Used only while `AFFILIATE_LINKS=on`. |
| `CARDKINGDOM_PARTNER_ID` | No | Card Kingdom partner ID, sent as `?partner=`. Used only while `AFFILIATE_LINKS=on`. |

## Scripts

| Command | Description |
|---|---|
| `npm run dev:docker` | Start full dev environment |
| `npm run dev:logs` | Tail docker compose logs |
| `npm run rebuild-frontend` | Rebuild Next.js container only |
| `npm test` | Run unit tests |
| `npm run test:debug` | Run tests in watch mode |
| `npm run test:integration` | Run integration tests against a real Postgres database |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema changes without migrations |
| `npm run studio` | Open Prisma Studio |

## Testing

There are two kinds of Jest tests, and they run separately:

- **Unit tests** (`*.test.ts`, `npm test`) mock Prisma with `jest-mock-extended` (see `singleton.ts`), so they need no database.
- **Integration tests** (`*.integration.test.ts`, `npm run test:integration`) call the real tRPC procedures with the real Prisma client against Postgres. Setup runs `prisma migrate deploy` once and truncates every table before each test.

**Which one to write?** If the thing you care about is decided by the database, write an integration test. That covers anything in a Prisma `where`, `select` or relation (scoping to the current user, filtering out soft-deleted rows, date cutoffs), plus constraints and cascades. A mocked Prisma just returns whatever the test tells it to, so a unit test there only proves you passed the arguments you expected, not that the right rows come back. Write a unit test for logic that lives in our own code (input validation, branching, error mapping, pure helpers like `src/utils/scan`), or when you want to check that a failure path never reaches the database. A good rule of thumb for tRPC routers: one integration test per behavior a user would notice, and unit tests for the edge cases that are awkward to set up with real data.

To run integration tests locally, point `DATABASE_URL` at a throwaway local database. The suite refuses to run unless the host is `localhost` and the database name contains `test`, since it wipes the tables:

```bash
createdb magicvault_test   # or use the docker compose db on localhost:5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/magicvault_test npm run test:integration
```

CI runs them on every pull request against a `postgres:16` service container.

## Deployment

| Event | Result |
|---|---|
| Push to any branch | Vercel preview deployment |
| Merge to `main` | Vercel production deployment + migrations run via GitHub Action |

Self-hosted on the homelab (tailnet only, for testing before v1): see [docs/homelab.md](docs/homelab.md).
