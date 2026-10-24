# Deployer

Test launcher for one pump.fun coin at a time. A test coin lands in the day's pump.fun traffic, not on MemeWarzone.

`dry_run` is on. A dry run prints the next coin and does not send a transaction or mark the coin used.

## What a live run does

1. Take the first unused coin in `data/coins.json`.
2. Upload its image and metadata JSON to Pinata.
3. Send one pump.fun create transaction from `DEPLOYER_SECRET_KEY`.
4. Write the mint and signature to `data/deployments.json` and mark the coin used.

Pump.fun requires a creator buy on that create transaction. Set `initial_buy_sol` in `config.json`. The run refuses an amount above `max_creator_buy_sol`. The cap in the repo is 0.05 SOL. One live launch is allowed per UTC day.

The create request is one JSON object from the creator wallet. This build has no follow-up buys and no Jito bundle.

## Run

```bash
npm install
npm test
cp .env.example .env
npm run once
```

`npm run serve` opens a status page on `127.0.0.1:8790` at `/deployer`. With `dry_run` still true, the clock does not launch anything.

To send a real create: put the image files in place, set `PINATA_JWT` and `DEPLOYER_SECRET_KEY`, set `initial_buy_sol`, set `dry_run` to false, then run `npm run once` once and read the log before leaving the scheduler on.

A file named `STOP` in this directory, or `DEPLOYER_STOP=1`, blocks the next run.

## Path on the bot server

The bots stay on `app.mcga.site` port 8787. This status page is port 8790. The Caddy block that serves it at `app.mcga.site/deployer` is in `deploy/caddy-path.txt`. It is not applied yet.
