# Prerequisites

This project assumes working familiarity with the following. You don't need to be an expert, but you should know enough to get yourself unstuck.

## Tools

**[Docker](https://docs.docker.com/get-docker/)**
Used to run the full dev environment locally — Next.js, Postgres, and Mailcatcher in one command. If you haven't used Docker before, [Docker's getting started guide](https://docs.docker.com/get-started/) is worth an hour of your time.

**[Node.js](https://nodejs.org)**
The project pins a Node version in `.node-version`. Use a version manager rather than installing Node directly — it'll save you pain when switching between projects.
- [nvm](https://github.com/nvm-sh/nvm) (Mac/Linux)
- [nodenv](https://github.com/nodenv/nodenv) (Mac/Linux)
- [fnm](https://github.com/Schniz/fnm) (Mac/Linux/Windows, fast)

**[Vercel CLI](https://vercel.com/docs/cli)**
Used to pull environment variables and link the project. Install with `npm i -g vercel`.

**[Git](https://git-scm.com)**
Standard version control. PRs are squash-merged into `main`.

## Concepts

**[tRPC](https://trpc.io/docs)**
Type-safe API layer between the Next.js frontend and backend. If you've used REST or GraphQL the mental model is similar — procedures instead of endpoints.

**[Prisma](https://www.prisma.io/docs)**
ORM for Postgres. Schema lives in `prisma/schema.prisma`. Changes go through migrations (`npm run db:migrate`).

**[NextAuth](https://next-auth.js.org/getting-started/introduction)**
Handles authentication. Supported providers: Google, Discord, GitHub, and email magic link (Mailcatcher catches these locally).

## AI Agents

This project is set up to work well with AI coding assistants (Claude Code, Cursor, etc.). The `CLAUDE.md` file at the root contains project context, conventions, and workflow instructions that agents use automatically. If you're using an AI assistant, point it at that file first.
