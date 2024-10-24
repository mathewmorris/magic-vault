# Magic Vault
> A web application to keep track of your Magic the Gathering collection

## Features
- [x] Search for any card
- [ ] Create collections
- [ ] See value of your collections (updated daily)

## Stack
- This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.
- Postgres

## Local Development
> I'm using Docker for local development. You should be able to run one command to get everything up and running; ready for development.

- link to vercel
    ```bash
        npx vercel link
    ```
    link to the existing project `magic-vault`

- download .env file
    ```bash
        npx vercel env pull
    ```

- run `docker compose up -d`

The app should be exposed at `localhost:3000` ready for development.

## What happens when I push a new branch to Github?
    1. Vercel [creates a Preview deployment](https://vercel.com/magicians/magic-vault/deployments)

## What happens when I merge into `main`?
    1. Vercel [creates a Production deployment](https://vercel.com/magicians/magic-vault/deployments)
    2. Database migrations are run automatically with github action `deploy`.

