import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Coin } from "./types.ts";

export function coinsPath(root: string): string {
  return path.join(root, "data", "coins.json");
}

export function readCoins(root: string): Coin[] {
  return JSON.parse(readFileSync(coinsPath(root), "utf8")) as Coin[];
}

export function writeCoins(root: string, coins: Coin[]): void {
  const file = coinsPath(root);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(coins, null, 2) + "\n");
  renameSync(tmp, file);
}

/** First unused coin in file order. The pool is never shuffled and a used coin stays used. */
export function pickUnused(coins: Coin[]): Coin | undefined {
  return coins.find((coin) => !coin.used);
}

export function markUsed(coins: Coin[], id: string, mint: string, at: string): Coin[] {
  let found = false;
  const next = coins.map((coin) => {
    if (coin.id !== id) return coin;
    found = true;
    if (coin.used) throw new Error(`Coin ${id} is already used.`);
    return {
      ...coin,
      used: true,
      used_on_chain: "solana",
      deployed_at: at,
      contract_address: mint,
    };
  });
  if (!found) throw new Error(`Coin ${id} is not in the pool.`);
  return next;
}
