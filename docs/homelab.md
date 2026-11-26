# Magic Vault on the homelab

Runs Magic Vault on bananajuice the same way quest-log runs there: built from a
clone in `~/apps/`, Docker Compose, Caddy on the host, and a Pi-hole `.internal`
name. Tailnet only. Nothing is port-forwarded.

| What | Address | Container |
|---|---|---|
| App | http://magicvault.internal | `magic-vault` on 127.0.0.1:3000 |
| Sign-in inbox | http://mailpit.internal | `magic-vault-mailpit` on 127.0.0.1:8025 |
| Database | inside the compose network only | `magic-vault-db` (Postgres 16) |

## First time

On bananajuice:

```bash
git clone https://github.com/mathewmorris/magic-vault ~/apps/magic-vault
cd ~/apps/magic-vault
cp .env.homelab.example .env.homelab
nano .env.homelab   # fill in NEXTAUTH_SECRET and the Postgres password (twice)
docker compose -f compose.homelab.yaml up -d --build
```

The first build is slow on bananajuice's CPU. If it runs out of memory, build on
juicemachine and copy the image over:

```bash
# on juicemachine, in the repo
docker build -f Dockerfile.homelab -t magic-vault:homelab .
docker save magic-vault:homelab | ssh bj docker load
# then on bananajuice
docker compose -f compose.homelab.yaml up -d --no-build
```

The app runs `prisma migrate deploy` every time it starts, so the database
schema is created on the first start.

The database runs `pgvector/pgvector:pg16` (Postgres 16 with pgvector, for AI
scan). It used to be `postgres:16-alpine`. Same major version, so the volume
carries over, but Alpine and Debian sort text differently, so after the switch
rebuild the indexes once:

```bash
docker compose -f compose.homelab.yaml exec db psql -U magic_vault -d magic_vault \
  -c 'REINDEX DATABASE magic_vault' -c 'ALTER DATABASE magic_vault REFRESH COLLATION VERSION'
```

### Caddy (bananajuice)

Add to `/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`:

```
http://magicvault.internal {
	reverse_proxy 127.0.0.1:3000
}

http://mailpit.internal {
	reverse_proxy 127.0.0.1:8025
}
```

The `http://` prefix keeps Caddy from trying to get certificates for `.internal`.

### Pi-hole (applejuice)

Add two local DNS records pointing at bananajuice's Tailscale IP. `dns.hosts`
is replaced whole, so read the current list first and pass it back with the
two new entries added:

```bash
sudo pihole-FTL --config dns.hosts
sudo pihole-FTL --config dns.hosts '[ ...existing entries..., "<bananajuice IP> magicvault.internal", "<bananajuice IP> mailpit.internal" ]'
```

The IPs live in the private homelab repo, not here, since this repo is public.

### Load the cards

A fresh database has no cards. Load them from Scryfall:

```bash
docker compose -f compose.homelab.yaml exec app npx prisma db seed
```

The seed downloads Scryfall's whole default-cards file and holds it in memory,
which may be too much for 4 GB. If it dies, stop there and say so on the PR.

## Sign in

1. Open http://magicvault.internal and sign in with any email address.
2. Open http://mailpit.internal and click the link in the message.

Mailpit catches every message, so no mail leaves the house. Discord and GitHub
sign-in turn on only if you put their credentials in `.env.homelab` and add
`http://magicvault.internal/api/auth/callback/discord` (or `/github`) to that
OAuth app. Google won't accept a `.internal` address.

## Updating

```bash
cd ~/apps/magic-vault
git pull
docker compose -f compose.homelab.yaml up -d --build
```

## Known gaps

- **Backups:** the Postgres volume `magic-vault-pgdata` is not in the nightly
  snapshot yet. That waits on `pg_dump` in the homelab backup (homelab ROADMAP).
- **Shared Postgres:** this compose file runs its own Postgres because the shared
  instance doesn't exist yet. When it does, point `DATABASE_URL` at it and drop
  the `db` service.
- **Card updates:** the Scryfall broker (`scryfall-data-broker/`) isn't scheduled
  here yet.
- **Public v1:** swap Mailpit for a sending service and set `NEXTAUTH_URL` to the
  public address.
