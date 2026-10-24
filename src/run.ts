import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, utcStamp } from "./config.ts";
import { assertCreatorBuy } from "./createBody.ts";
import { appendLog, launchedToday, readLog } from "./logger.ts";
import { markUsed, pickUnused, readCoins, writeCoins } from "./pool.ts";
import type { RunResult } from "./types.ts";

export interface CreateRequest {
  root: string;
  name: string;
  symbol: string;
  description: string;
  imagePath: string;
  creatorBuySol: number;
  maxCreatorBuySol: number;
  slippagePct: number;
  priorityFeeSol: number;
  rpcUrl: string;
  secretKey: string;
  pinataJwt: string;
}

export async function runOnce(options: {
  root: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  create?: (request: CreateRequest) => Promise<{ mint: string; signature: string; metadataUri: string }>;
}): Promise<RunResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const root = options.root;
  const config = loadConfig(root, env);

  if (existsSync(path.join(root, "STOP")) || env.DEPLOYER_STOP === "1") {
    return { ok: false, dryRun: config.dryRun, skipped: true, error: "Stopped. Remove the STOP file to arm it again." };
  }

  const coin = pickUnused(readCoins(root));
  if (!coin) return { ok: false, dryRun: config.dryRun, error: "No unused coins in data/coins.json." };

  const day = utcStamp(now);
  if (!config.dryRun && launchedToday(readLog(root), day)) {
    return { ok: false, dryRun: false, skipped: true, error: `Already launched on ${day}.` };
  }

  if (config.dryRun) {
    appendLog(root, {
      coin_id: coin.id,
      name: coin.name,
      ticker: coin.ticker,
      chain: "solana",
      platform: "pumpfun",
      mint: null,
      metadata_uri: null,
      launch_tx: null,
      creator_buy_sol: config.initialBuySol,
      timestamp: now.toISOString(),
      success: true,
      dry_run: true,
    });
    return {
      ok: true,
      dryRun: true,
      coinId: coin.id,
      name: coin.name,
      ticker: coin.ticker,
      creatorBuySol: config.initialBuySol,
      mint: null,
      signature: null,
    };
  }

  const secret = env.DEPLOYER_SECRET_KEY?.trim() ?? "";
  const pinataJwt = env.PINATA_JWT?.trim() ?? "";
  if (!secret) return { ok: false, dryRun: false, error: "DEPLOYER_SECRET_KEY is missing." };
  if (!pinataJwt) return { ok: false, dryRun: false, error: "PINATA_JWT is missing." };
  if (!options.create) return { ok: false, dryRun: false, error: "Create function is not wired." };

  let minted: { mint: string; signature: string; metadataUri: string } | undefined;
  try {
    assertCreatorBuy(config.initialBuySol, config.maxCreatorBuySol);
    minted = await options.create({
      root,
      name: coin.name,
      symbol: coin.ticker,
      description: coin.lore,
      imagePath: coin.image_path,
      creatorBuySol: config.initialBuySol,
      maxCreatorBuySol: config.maxCreatorBuySol,
      slippagePct: config.slippagePct,
      priorityFeeSol: config.priorityFeeSol,
      rpcUrl: config.rpcUrl,
      secretKey: secret,
      pinataJwt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(root, {
      coin_id: coin.id,
      name: coin.name,
      ticker: coin.ticker,
      chain: "solana",
      platform: "pumpfun",
      mint: null,
      metadata_uri: null,
      launch_tx: null,
      creator_buy_sol: config.initialBuySol,
      timestamp: now.toISOString(),
      success: false,
      dry_run: false,
      error: message,
    });
    return { ok: false, dryRun: false, coinId: coin.id, name: coin.name, ticker: coin.ticker, error: message };
  }

  const at = now.toISOString();
  writeCoins(root, markUsed(readCoins(root), coin.id, minted.mint, at));
  appendLog(root, {
    coin_id: coin.id,
    name: coin.name,
    ticker: coin.ticker,
    chain: "solana",
    platform: "pumpfun",
    mint: minted.mint,
    metadata_uri: minted.metadataUri,
    launch_tx: minted.signature,
    creator_buy_sol: config.initialBuySol,
    timestamp: at,
    success: true,
    dry_run: false,
  });
  return {
    ok: true,
    dryRun: false,
    coinId: coin.id,
    name: coin.name,
    ticker: coin.ticker,
    mint: minted.mint,
    signature: minted.signature,
    creatorBuySol: config.initialBuySol,
  };
}
