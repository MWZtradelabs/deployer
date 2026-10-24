import { readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "./types.ts";

interface RawConfig {
  platform?: string;
  initial_buy_sol?: number;
  max_creator_buy_sol?: number;
  slippage_pct?: number;
  priority_fee_sol?: number;
  daily_time_utc?: string;
  dry_run?: boolean;
  rpc_url?: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function loadConfig(root: string, env: NodeJS.ProcessEnv = process.env): Config {
  const raw = JSON.parse(readFileSync(path.join(root, "config.json"), "utf8")) as RawConfig;
  if (raw.platform !== "pumpfun") {
    throw new Error("This build launches on pump.fun only.");
  }
  const dailyTimeUtc = raw.daily_time_utc ?? "08:00";
  if (!TIME.test(dailyTimeUtc)) throw new Error("daily_time_utc must be HH:MM");
  const initialBuySol = Number(raw.initial_buy_sol ?? 0);
  const maxCreatorBuySol = Number(raw.max_creator_buy_sol ?? 0);
  if (!Number.isFinite(initialBuySol) || initialBuySol < 0) throw new Error("initial_buy_sol must be >= 0");
  if (!Number.isFinite(maxCreatorBuySol) || maxCreatorBuySol <= 0) throw new Error("max_creator_buy_sol must be > 0");
  return {
    platform: "pumpfun",
    initialBuySol,
    maxCreatorBuySol,
    slippagePct: Number(raw.slippage_pct ?? 10),
    priorityFeeSol: Number(raw.priority_fee_sol ?? 0.00001),
    dailyTimeUtc,
    dryRun: raw.dry_run !== false,
    rpcUrl: env.RPC_URL?.trim() || raw.rpc_url || "https://api.mainnet-beta.solana.com",
  };
}

export function utcStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcClock(date: Date): string {
  return date.toISOString().slice(11, 16);
}
