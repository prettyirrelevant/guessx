# guessx

[![ci](https://img.shields.io/github/actions/workflow/status/prettyirrelevant/guessx/ci.yml?style=for-the-badge&label=ci)](https://github.com/prettyirrelevant/guessx/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/prettyirrelevant/guessx?style=for-the-badge)](LICENSE)
[![next.js](https://img.shields.io/badge/next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![cloudflare](https://img.shields.io/badge/cloudflare-durable_objects-f38020?style=for-the-badge&logo=cloudflare)](https://developers.cloudflare.com/durable-objects/)

real-time multiplayer guessing game. challenge your friends to guess songs, logos, actors, and flags. fastest finger wins.

**[play now](https://guessx.enio.la?utm_source=github&utm_medium=readme)**

## game modes

- **music** - listen to a song preview and guess the track
- **logos** - identify the brand behind a familiar logo
- **actors** - identify actors from eight film and television industries
- **flags** - identify national flags from every continent

## how it works

1. create a room, pick a mode, and share the code
2. 2-20 players join and the host starts the game
3. each round: a question appears, answer before the timer runs out
4. points are awarded by speed (1st = 10, 2nd = 7, 3rd = 5, 4th = 3), with streak bonuses and a 2x final round
5. leaderboard and podium at the end

no accounts needed, just a display name and an avatar.

## stack

- [next.js 15](https://nextjs.org) + react 19
- cloudflare workers, durable objects, hono, and partyserver
- turborepo with pnpm workspaces
- [oxlint](https://oxc.rs) + [oxfmt](https://oxc.rs) for linting and formatting
- one OpenNext Cloudflare Worker deployment

## development

```sh
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm dev
```

Use `pnpm --filter @guessx/web preview` to test the complete Worker locally.

Generate the signing secret with `openssl rand -hex 32`. Store production secrets with:

```sh
cd apps/web
pnpm wrangler secret put AUTH_SIGNING_SECRET
pnpm wrangler secret put TMDB_API_READ_ACCESS_TOKEN
```

Deploy the site, API, WebSocket server, and Durable Object together with `pnpm deploy`.

## workspace

- `apps/web` — Next.js app and Cloudflare Worker entry
- `apps/mobile` — Expo app
- `packages/server` — HTTP and WebSocket clients, Hono, content generation, PartyServer, and Durable Object
- `packages/game` — shared game protocol, models, validation, and catalogs

See the in-app `/credits` page for provider attribution and licensing details.

## license

mit
