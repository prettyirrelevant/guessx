# guessx

[![ci](https://img.shields.io/github/actions/workflow/status/prettyirrelevant/guessx/ci.yml?style=for-the-badge&label=ci)](https://github.com/prettyirrelevant/guessx/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/prettyirrelevant/guessx?style=for-the-badge)](LICENSE)
[![next.js](https://img.shields.io/badge/next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![convex](https://img.shields.io/badge/convex-realtime-f3694c?style=for-the-badge)](https://convex.dev)

real-time multiplayer guessing game. challenge your friends to guess the song, spot the landmark, or name the actor. fastest finger wins.

**[play now](https://guessx.enio.la?utm_source=github&utm_medium=readme)**

## game modes

- **music** - listen to a 30-second preview and guess the track. supports up to 3 artists per game (deezer api)
- **places** - view a landmark photo and name it. 20 countries supported, from the US to Nigeria (openverse api)
- **actors** - see a headshot and identify the actor. 8 industry categories: hollywood, bollywood, nollywood, k-drama, british cinema, french cinema, anime, telenovela (tmdb api)

## how it works

1. create a room, pick a mode, and share the code
2. 2-20 players join and the host starts the game
3. each round: a question appears, answer before the timer runs out
4. points are awarded by speed (1st = 10, 2nd = 7, 3rd = 5, 4th = 3), with streak bonuses and a 2x final round
5. leaderboard and podium at the end

no accounts needed, just a display name and an avatar.

## stack

- [next.js 15](https://nextjs.org) + react 19
- [convex](https://convex.dev) for real-time backend, database, and scheduling
- [oxlint](https://oxc.rs) + [oxfmt](https://oxc.rs) for linting and formatting
- deployed on [vercel](https://vercel.com)

## development

```
pnpm install
pnpx convex dev   # start convex backend
pnpm dev           # start next.js dev server
```

requires `TMDB_ACCESS_TOKEN` for actor mode.

## license

mit
