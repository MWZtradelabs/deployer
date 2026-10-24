import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCreateBody, serializeCreate } from "../src/createBody.ts";
import { metadataJson } from "../src/metadata.ts";
import { readCoins } from "../src/pool.ts";
import { runOnce, type CreateRequest } from "../src/run.ts";

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "deployer-"));
  writeFileSync(
    path.join(root, "config.json"),
    JSON.stringify({
      platform: "pumpfun",
      initial_buy_sol: 0.01,
      max_creator_buy_sol: 0.05,
      slippage_pct: 10,
      priority_fee_sol: 0.00001,
      daily_time_utc: "08:00",
      dry_run: true,
      rpc_url: "https://api.mainnet-beta.solana.com",
    }),
  );
  return root;
}

function writePool(root: string): void {
  mkdirSync(path.join(root, "data"), { recursive: true });
  const coin = (id: string, name: string, ticker: string) => ({
    id,
    name,
    ticker,
    lore: "A short line.",
    image_path: "images/coin.png",
    used: false,
    used_on_chain: null,
    deployed_at: null,
    contract_address: null,
  });
  writeFileSync(
    path.join(root, "data", "coins.json"),
    JSON.stringify([coin("coin_0001", "Sleepy Banana", "SLPBN"), coin("coin_0002", "Turbo Frog", "TRFRG")]),
  );
}

test("create body is one object and dies above the cap", () => {
  const body = buildCreateBody({
    publicKey: "CreatorPubkey",
    name: "Sleepy Banana",
    symbol: "SLPBN",
    uri: "https://ipfs.io/ipfs/bafytest",
    mint: "MintPubkey",
    creatorBuySol: 0.01,
    maxCreatorBuySol: 0.05,
    slippagePct: 10,
    priorityFeeSol: 0.00001,
  });
  const wire = serializeCreate(body);
  assert.equal(wire.startsWith("{"), true);
  assert.equal(Array.isArray(JSON.parse(wire)), false);
  assert.equal(body.action, "create");
  assert.equal(body.pool, "pump");
  assert.equal(body.amount, 0.01);
  assert.equal(Object.keys(body).length, 9);
  assert.throws(
    () =>
      buildCreateBody({
        publicKey: "CreatorPubkey",
        name: "Sleepy Banana",
        symbol: "SLPBN",
        uri: "ipfs",
        mint: "Mint",
        creatorBuySol: 1,
        maxCreatorBuySol: 0.05,
        slippagePct: 10,
        priorityFeeSol: 0.00001,
      }),
    /max_creator_buy_sol/,
  );
  assert.throws(
    () =>
      buildCreateBody({
        publicKey: "CreatorPubkey",
        name: "Sleepy Banana",
        symbol: "SLPBN",
        uri: "ipfs",
        mint: "Mint",
        creatorBuySol: 0,
        maxCreatorBuySol: 0.05,
        slippagePct: 10,
        priorityFeeSol: 0.00001,
      }),
    /creator buy/,
  );
});

test("metadata json matches the pump.fun shape", () => {
  assert.deepEqual(
    metadataJson({
      name: "Sleepy Banana",
      symbol: "SLPBN",
      description: "A banana that only trades at night.",
      image: "https://ipfs.io/ipfs/bafyimg",
    }),
    {
      name: "Sleepy Banana",
      symbol: "SLPBN",
      description: "A banana that only trades at night.",
      image: "https://ipfs.io/ipfs/bafyimg",
      showName: true,
      createdOn: "https://pump.fun",
    },
  );
});

test("dry run does not spend a coin or call create", async () => {
  const root = fixture();
  writePool(root);
  let calls = 0;
  const result = await runOnce({
    root,
    now: new Date("2026-10-24T08:00:00Z"),
    create: async () => {
      calls += 1;
      return { mint: "mint", signature: "sig", metadataUri: "ipfs://x" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.ticker, "SLPBN");
  assert.equal(calls, 0);
  assert.equal(readCoins(root)[0]?.used, false);
});

test("live run creates once, then the same day refuses a second launch", async () => {
  const root = fixture();
  writePool(root);
  const configPath = path.join(root, "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { dry_run: boolean };
  config.dry_run = false;
  writeFileSync(configPath, JSON.stringify(config));
  const seen: CreateRequest[] = [];
  const create = async (request: CreateRequest) => {
    seen.push(request);
    return { mint: "Mint111", signature: "Sig111", metadataUri: "https://ipfs.io/ipfs/meta" };
  };
  const env = { DEPLOYER_SECRET_KEY: "secret", PINATA_JWT: "jwt" };
  const now = new Date("2026-10-24T08:00:00Z");
  const first = await runOnce({ root, now, env, create });
  const second = await runOnce({ root, now, env, create });
  assert.equal(first.ok, true);
  assert.equal(first.mint, "Mint111");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.creatorBuySol, 0.01);
  assert.equal(seen[0]?.symbol, "SLPBN");
  assert.equal(readCoins(root)[0]?.used, true);
  assert.equal(readCoins(root)[0]?.contract_address, "Mint111");
  assert.equal(readCoins(root)[1]?.used, false);
  assert.equal(second.ok, false);
  assert.match(second.error ?? "", /Already launched/);
});

test("STOP blocks a live run", async () => {
  const root = fixture();
  writePool(root);
  writeFileSync(path.join(root, "STOP"), "\n");
  const config = JSON.parse(readFileSync(path.join(root, "config.json"), "utf8")) as { dry_run: boolean };
  config.dry_run = false;
  writeFileSync(path.join(root, "config.json"), JSON.stringify(config));
  let calls = 0;
  const result = await runOnce({
    root,
    env: { DEPLOYER_SECRET_KEY: "secret", PINATA_JWT: "jwt" },
    create: async () => {
      calls += 1;
      return { mint: "m", signature: "s", metadataUri: "u" };
    },
  });
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
  assert.equal(readCoins(root)[0]?.used, false);
});
