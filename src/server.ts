import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadConfig } from "./config.ts";
import { readLog } from "./logger.ts";
import { pickUnused, readCoins } from "./pool.ts";

function creator(env: NodeJS.ProcessEnv): string {
  const secret = env.DEPLOYER_SECRET_KEY?.trim();
  if (!secret) return "not set";
  try {
    return Keypair.fromSecretKey(bs58.decode(secret)).publicKey.toBase58();
  } catch {
    return "set, but the secret key could not be read";
  }
}

function status(root: string) {
  const config = loadConfig(root);
  const coins = readCoins(root);
  const next = pickUnused(coins);
  const log = readLog(root);
  return {
    platform: config.platform,
    dryRun: config.dryRun,
    dailyTimeUtc: config.dailyTimeUtc,
    creatorBuySol: config.initialBuySol,
    maxCreatorBuySol: config.maxCreatorBuySol,
    creatorWallet: creator(process.env),
    pinata: process.env.PINATA_JWT?.trim() ? "set" : "not set",
    unusedCoins: coins.filter((coin) => !coin.used).length,
    nextCoin: next ? { id: next.id, name: next.name, ticker: next.ticker } : null,
    last: log.at(-1) ?? null,
  };
}

function html(root: string): string {
  const view = status(root);
  const last = view.last
    ? `${view.last.dry_run ? "dry run" : view.last.success ? "launched" : "failed"} · ${view.last.name} (${view.last.ticker}) · ${view.last.timestamp}`
    : "none";
  const next = view.nextCoin ? `${view.nextCoin.name} ($${view.nextCoin.ticker})` : "pool empty";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deployer</title>
  <style>
    body { font: 16px/1.45 ui-sans-serif, sans-serif; margin: 2rem auto; max-width: 40rem; color: #1c1917; background: #fafaf9; }
    h1 { font-size: 1.4rem; }
    dt { margin-top: 0.8rem; color: #57534e; }
    dd { margin: 0; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Pump.fun test deployer</h1>
  <p>One create transaction from the creator wallet. Test coins go to pump.fun.</p>
  <dl>
    <dt>Mode</dt><dd>${view.dryRun ? "dry run" : "live"}</dd>
    <dt>Daily time UTC</dt><dd>${view.dailyTimeUtc}</dd>
    <dt>Creator buy</dt><dd>${view.creatorBuySol} SOL (cap ${view.maxCreatorBuySol})</dd>
    <dt>Creator wallet</dt><dd>${view.creatorWallet}</dd>
    <dt>Pinata</dt><dd>${view.pinata}</dd>
    <dt>Unused coins</dt><dd>${view.unusedCoins}</dd>
    <dt>Next coin</dt><dd>${next}</dd>
    <dt>Last record</dt><dd>${last}</dd>
  </dl>
</body>
</html>`;
}

function send(res: ServerResponse, code: number, body: string, type: string): void {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

export function startServer(root: string, env: NodeJS.ProcessEnv = process.env): void {
  const host = env.HOST?.trim() || "127.0.0.1";
  const port = Number(env.PORT ?? 8790);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    if (url === "/" || url === "/deployer" || url === "/deployer/") {
      send(res, 200, html(root), "text/html; charset=utf-8");
      return;
    }
    if (url === "/api/status" || url === "/deployer/api/status") {
      send(res, 200, JSON.stringify(status(root), null, 2), "application/json; charset=utf-8");
      return;
    }
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  });
  server.listen(port, host, () => {
    console.log(`status page at http://${host}:${port}/deployer`);
  });
}
