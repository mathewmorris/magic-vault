# Magic Vault
> A web application to keep track of your Magic the Gathering collection

## Features
- [x] Search for any card
- [x] Create collections
- [ ] Update collections
- [ ] Delete collections
- [ ] See value of your collections (updated daily)
- [x] Login with google, discord, or github

## Stack
- This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.
- Next.js
- tRPC
- Prisma
- Tailwind CSS
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

- run application using docker
    ```bash
        npm run dev:docker
    ```

The frontend next application will be ready for connections at `localhost:3000`.
The postgres database will be ready for connections at `localhost:5432`.

## Some important scripts

|command|description|
|-|-|
|`npm run rebuild-frontend`|Will rebuild the next application and start it up without triggering a database rebuild|
|`npm run dev:docker`|starts dev environment via docker|
|`npm run dev:logs`|starts reading docker compose log files for application container|

## Process

### What happens when I push a new branch to Github?
    1. Vercel [creates a Preview deployment](https://vercel.com/magicians/magic-vault/deployments)

### What happens when I merge into `main`?
    1. Vercel [creates a Production deployment](https://vercel.com/magicians/magic-vault/deployments)
    2. Database migrations are run automatically with github action `deploy`.

## Document Coding Patterns
> Practicing documenting coding patterns is important. [This video](https://youtu.be/oJbfMBROEO0?si=QL0Xty-Q2nVlaiZo&t=311) speaks on this a little bit

### General rules
- colocate test file (e.g. Component.ts should exist alongside Component.test.ts)
- follow [Arrage-Act-Assert](https://automationpanda.com/2020/07/07/arrange-act-assert-a-pattern-for-writing-good-tests/) when writing tests

### Testing Asynchronous Code
```ts
    // Resolving
    return expect(
      doSomething();
    ).resolves.toStrictEqual(expectedResult);

    // Rejecting
    return expect(
      doSomething();
    ).rejects.toStrictEqual(expectedError);
```

## Document Logic

### Collection soft-delete procedure
- When a **collection is active**, it will not have a date in `deletedAt` field
- When user wants to **delete a collection**, `softDelete` procedure will be executed
- When user wants to **recover a collection**, `recoverCollection` procedure will be executed
- Every day, a cronjob will hit the `api/collections/cleanup` endpoint which will execute `destroy30DaysOld`

### `softDelete` procedure
1. If `verifyCollectionOwnership` resolves:
    - update collection `deletedAt` field to `new Date()`
2. return collection

### `recoverCollection` procedure
1. If `verifyCollectionOwnership` resolves:
    - update collection `deletedAt` field to `null`
2. return collection

### `destroy30DaysOld` procedure
1. If collections exists that have `deletedAt` older than 30 days
    - run deleteMany mutation with list of collectionIds
2. return number of deleted collections

### `verifyCollectionOwnership` API utility
- if single collection exists:
    - if owner id matches session id:
        - resolve with collection
    - else:
        - reject with FORBIDDEN
- else, reject with NOT_FOUND

