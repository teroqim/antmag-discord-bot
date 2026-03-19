# AntMag Discord Bot

Standalone Discord bot for Railway, Fly.io, or any Node 18 host.

## Env vars

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `BOT_API_URL`
- `BOT_API_KEY`

## Local run

```bash
npm install
npm start
```

## Deploy

### Railway
1. Push this folder to a GitHub repo.
2. Create a new Railway project from that repo.
3. Add the env vars above.
4. Deploy.

### Fly.io
Use the included `Dockerfile`.

## Commands

- `/guide`
- `/search`
- `/tip`
