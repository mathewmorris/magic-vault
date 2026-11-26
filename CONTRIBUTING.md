# Contributing to Magic Vault

Thanks for checking out Magic Vault. It's a free web app for tracking your Magic: The Gathering collection, and you're welcome to follow along, pitch ideas, or jump in on the code.

## Where things are tracked

- **[Project board](https://github.com/users/mathewmorris/projects/2)**: the big picture. Every card sits in one of four columns: **Backlog** (on the list, not planned yet), **To Do** (up next), **In Progress** (someone's on it) and **Done**.
- **[Issues](https://github.com/mathewmorris/magic-vault/issues)**: bugs, ideas and feedback. The issue templates are set up to put new issues on the board.
- **[Discussions](https://github.com/mathewmorris/magic-vault/discussions)**: questions, loose ideas and anything that isn't a clear to-do yet.

## Ways to help

You don't need to write code to help out.

- **Report a bug.** [Open a bug report](https://github.com/mathewmorris/magic-vault/issues/new?template=bug_report.yml) with what happened and how to make it happen again.
- **Pitch an idea.** [Open an idea](https://github.com/mathewmorris/magic-vault/issues/new?template=feature_request.yml), or start a discussion if it's still rough.
- **Leave feedback.** [Tell us](https://github.com/mathewmorris/magic-vault/issues/new?template=feedback.yml) what's working, what's annoying and what's confusing.
- **Pick up an issue.** Look for [`good first issue`](https://github.com/mathewmorris/magic-vault/issues?q=is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/mathewmorris/magic-vault/issues?q=is%3Aopen+label%3A%22help+wanted%22). Leave a comment saying you're taking it so nobody doubles up.

## Local setup

The [README](./README.md) covers getting started, scripts and testing, and [PREREQUISITES.md](./PREREQUISITES.md) lists the tools you'll want (Docker, Node, Git).

The README's `npm run vercel:env` step pulls env vars from the Vercel project, which needs access you probably don't have. That's fine. Use the placeholder values instead:

```bash
npm install
cp .env.example .env.local
npm run dev:docker
```

What that means locally:

- Google, Discord and GitHub sign-in won't work, since the placeholder IDs aren't real OAuth apps. Sign in with the email magic link instead and grab the link from Mailcatcher at `http://localhost:1080`.
- The optional stuff (donation link, affiliate links, AI scan) stays off unless you set it. See the README's env var table.
- Card data comes from Scryfall. `npm run db:seed` loads every card from Scryfall's bulk file into whatever database `DATABASE_URL` points at, so point it at your local one.

If you're using an AI coding assistant, point it at [CLAUDE.md](./CLAUDE.md) first.

## Branches and pull requests

1. Branch off `main`.
2. Keep PRs small and about one thing. Easier to review, easier to merge.
3. Fill in the PR template: before and after, the issue it closes, how you tested it, and screenshots for UI changes.
4. CI has to pass. It runs lint, unit tests and a build, plus integration tests against Postgres and the Scryfall broker tests when broker files change.
5. Mat reviews and merges. PRs get squash-merged into `main`.

## Code style

- Run `npm run lint`, `npx tsc --noEmit` and `npm test` before you push. If you touched the database or a tRPC router, run `npm run test:integration` too (the README explains how).
- Not sure whether to write a unit test or an integration test? The README's Testing section has a good rule of thumb.
- Styling is Tailwind. Keep the pink and purple look (see `tailwind.config.ts`) so new screens feel like the rest of the app.
- The Scryfall data broker (`scryfall-data-broker/`) is Python. Its tests run with `python3 -I -m unittest` from that folder.

## Card data and the Fan Content Policy

Card data and images come from [Scryfall](https://scryfall.com). Please keep crediting them wherever card data shows up.

Magic Vault is unofficial Fan Content permitted under the [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). It isn't approved or endorsed by Wizards. Please don't add official Wizards of the Coast frame art, logos or other trademarks to the app.

## Be decent

Be kind and assume good intent. We're all here because we like Magic.
