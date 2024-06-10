# Magic Vault
> A web application to keep track of your Magic the Gathering collection

## Features
- [x] Search for any card
- [ ] Create collections
- [ ] See value of your collections (updated daily)

## Stack
- This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.
- We are using [Supabase](https://supabase.com/) for our database at the moment, we might use other features as we need them.

## Local Development

- install dependencies
    ```bash
        npm install
    ```

- download .env file
    ```bash
        npx vercel env pull
    ```

- get your [local supabase database](https://supabase.com/docs/guides/cli/local-development) ready to go
    ```
        npx supabase start
    ```
    ```
        npx prisma db push // Syncs database with schema
    ```
    ```
        npx prisma db seed // Seeds database
    ```

- run `npm run dev`

