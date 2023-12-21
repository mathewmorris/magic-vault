# Magic Vault

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## Quickstart

- install dependencies

    ```bash
        npm install
    ```

- download .env file

    ```bash
        vercel env pull
    ```
    if you don't have vercel run `npm install -g vercel@latest`

    IMPORTANT: rename `.env.local` to `.env`
    IMPORTANT: remove everything in .env for vercel (usually starts at NX_DAEMON)
    
    The vercel env vars mess with most things you want to do locally, like next_auth and prisma migrations. So removing them will help. There's probably a more elegant solution, but this was the easiest path.

- get your local mysql database ready to go
    - get mysql up and running [(more info here)](https://dev.mysql.com/doc/mysql-getting-started/en/#mysql-getting-started-installing)
    - create `magicvaultdb` database [(more info here)](https://dev.mysql.com/doc/refman/8.0/en/creating-database.html)
        ```mysql
            // in mysql
            CREATE DATABASE magicvaultdb;
        ```
    - create `developer` user [(more info here)](https://dev.mysql.com/doc/refman/8.0/en/create-user.html)
        ```mysql
            // in mysql
            CREATE USER 'developer'@'localhost' IDENTIFIED BY 'password';
        ```
    - grant permissions to `developer` user for `magicvaultdb` database [(more info here)](https://dev.mysql.com/doc/refman/8.0/en/grant.html#grant-database-privileges)
        ```mysql
            // in mysql
            GRANT ALL ON magicvaultdb.* TO 'developer'@'localhost';
        ```
    - apply prisma schema to db
        ```bash
            npx prisma db push
        ```

- run `npm run dev`

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

