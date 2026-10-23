# Daily Deployer Bot — Handoff Spec
**For Grok in VS Code**

## Goal
One automated memecoin launch per day.  
Random chain. Random pre-generated metadata (name, ticker, lore, image).  
1 native initial buy inside the launch block + 3–4 fast follow-up buys.  
Timed exit/recycle of remaining tokens (adjustable) to recover funds for future deploys.  
No unique X accounts.  
Stop when organic launches are sufficient.

## Chains
- **Solana** → Meteora DBC (existing factory)
- **Robinhood** → Uniswap V4 (existing factory)
- **BNB** → Uniswap V4 (existing factory)

## High-Level Architecture

```
[Daily Scheduler]
  → [Selector]          // unused coin + random chain
  → [Deployer]          // launch with single initial buy
  → [Fast Bundler]      // 3–4 additional buys ASAP after confirmation
  → [Logger]
  → [Notifier]          // optional post from main account

[Exit Scheduler]        // separate or same process, runs periodically
  → [Exit Checker]      // finds positions older than configured hours
  → [Seller]            // sells remaining tokens from buy wallets
  → [Logger]            // records recovered amount
```

## 1. Coin Pool (Pre-generated)
JSON file (or SQLite). Example record:

```json
{
  "id": "coin_0042",
  "name": "Sleepy Banana",
  "ticker": "SLPBN",
  "lore": "A banana that only trades at night.",
  "image_path": "images/sleepy_banana.png",
  "used": false,
  "used_on_chain": null,
  "deployed_at": null,
  "contract_address": null
}
```

- Hundreds generated offline.
- Bot marks `used: true` after successful deploy.
- Never reuse.

## 2. Config (`config.json`)

```json
{
  "chains": ["solana", "robinhood", "bnb"],
  "initial_buy": {
    "usd": 20
  },
  "fast_bundle": {
    "count": 4,
    "total_usd": 40,
    "mode": "as_fast_as_possible"
  },
  "exit": {
    "enabled": true,
    "hours_after_launch": 24,
    "check_interval_minutes": 60
  },
  "daily_time_utc": "08:00",
  "max_retries": 1,
  "dry_run": false
}
```

- `exit.hours_after_launch` is the main adjustable value (change to 12, 48, 72, etc.).
- `exit.enabled` can be toggled without code changes.

## 3. Core Modules

| Module | Responsibility |
|--------|----------------|
| `scheduler` | Daily launch + periodic exit checks |
| `selector` | Picks unused coin + random chain |
| `deployer/solana.ts` | Meteora DBC launch + single initial buy |
| `deployer/v4.ts` | Uniswap V4 launch (Robinhood + BNB) + single initial buy |
| `fastBundler.ts` | 3–4 buys as fast as possible after launch confirms |
| `seller.ts` | Sells remaining tokens from buy wallets on exit |
| `logger.ts` | Writes deployment + exit records |
| `notifier.ts` | Optional main-account announcement |

## 4. Interfaces

```ts
interface Coin {
  id: string;
  name: string;
  ticker: string;
  lore: string;
  image_path: string;
  used: boolean;
}

interface InitialBuy {
  wallet: string;
  amount: string;
}

interface DeployParams {
  coin: Coin;
  chain: "solana" | "robinhood" | "bnb";
  initialBuy: InitialBuy;
}

interface DeployResult {
  success: boolean;
  chain: string;
  contractAddress?: string;
  txHash?: string;
  error?: string;
}

interface Position {
  coin_id: string;
  chain: string;
  contract: string;
  wallets: string[];
  launched_at: string;
  exited: boolean;
  recovered_usd?: number;
}

async function deploy(params: DeployParams): Promise<DeployResult>
async function sellRemaining(position: Position): Promise<{ success: boolean; recovered?: string }>
```

## 5. Buy Structure (Final)

1. **Single initial buy** — passed into the launch call and executed by the launchpad’s launch block.
2. **3–4 fast follow-up buys** — submitted by `fastBundler` as soon as the launch transaction is confirmed.
   - Parallel where safe (especially Solana).
   - Minimal sequential delay on EVM chains if needed.
   - Separate wallets from the initial-buy wallet.

## 6. Exit / Recycle (Timed)

- After a configurable number of hours (`exit.hours_after_launch`), sell all remaining tokens held by the initial-buy and fast-bundle wallets.
- Funds stay in those wallets for the next deploy cycle.
- Only sells tokens acquired by the bot’s own buys.
- Fully adjustable via config (no code change needed to alter timing or disable).

## 7. Main Daily Loop

```ts
async function runDaily() {
  if (config.dry_run) {
    console.log("DRY RUN — no transactions");
  }

  const coin = await selector.pickUnusedCoin();
  const chain = selector.pickRandomChain();

  const deployResult = await deployer.deploy({
    coin,
    chain,
    initialBuy: buildInitialBuy(chain, config.initial_buy.usd)
  });

  if (!deployResult.success) {
    await logger.recordFailure(coin, chain, deployResult.error);
    return;
  }

  await fastBundler.execute({
    contractAddress: deployResult.contractAddress!,
    chain,
    count: config.fast_bundle.count,
    totalUsd: config.fast_bundle.total_usd
  });

  await logger.recordSuccess(coin, deployResult);
  await notifier.postOptional(coin, chain, deployResult.contractAddress);
  await selector.markUsed(coin.id, chain, deployResult.contractAddress);
}
```

## 8. Exit Loop

```ts
async function runExitCheck() {
  if (!config.exit.enabled) return;

  const openPositions = await logger.getOpenPositions();
  const cutoff = Date.now() - config.exit.hours_after_launch * 60 * 60 * 1000;

  for (const pos of openPositions) {
    if (new Date(pos.launched_at).getTime() < cutoff && !pos.exited) {
      const result = await seller.sellRemaining(pos);
      await logger.markExited(pos.coin_id, result);
    }
  }
}
```

## 9. Wallet Setup
- Separate funded wallet sets per chain.
- One wallet reserved for the native initial buy.
- 3–4 additional wallets for the fast bundle.
- Same wallets used for later exit sells.
- Fund from launchpad fee revenue + recycled proceeds.
- Document addresses for transparency.

## 10. Logger Output

**Deployment record:**
```json
{
  "coin_id": "coin_0042",
  "name": "Sleepy Banana",
  "ticker": "SLPBN",
  "chain": "solana",
  "contract": "...",
  "launch_tx": "...",
  "bundle_txs": ["...", "..."],
  "timestamp": "2026-10-24T08:00:00Z",
  "success": true,
  "exited": false
}
```

**Exit record (updated on same or linked entry):**
```json
{
  "exited": true,
  "exit_txs": ["...", "..."],
  "recovered_native": "0.12",
  "exited_at": "2026-10-25T08:05:00Z"
}
```

## 11. Safety & Ops
- `dry_run` flag (applies to both launch and exit).
- Hard daily spend cap.
- No automatic retry of the same coin.
- Exit timing fully adjustable in config.
- Alert on failure (Telegram/Discord/log).
- Easy kill switch (env var or `STOP` file).
- All private keys via environment variables only.
- Exit only touches bot-owned buy wallets.

## 12. Suggested File Structure

```
/deployer
  /src
    index.ts                 // daily + exit schedulers
    selector.ts
    fastBundler.ts
    seller.ts
    logger.ts
    notifier.ts
    /deployer
      solana.ts
      v4.ts
      index.ts
  /data
    coins.json
    deployments.json
  /images
  config.json
  .env.example
  README.md
```

## 13. Handoff Notes
- Factories already work — reuse existing deploy and swap/sell functions.
- Map the single `initialBuy` into the launch block parameter.
- Implement `fastBundler` for 3–4 buys with minimal delay after confirmation.
- Implement `seller.ts` to sell remaining balances from the known buy wallets after the configured hours.
- Exit hours and enable flag must be config-driven.
- Start with `dry_run: true` and one chain.
- Coin pool + images will be supplied separately.
- Keep interfaces clean.
- Priority: reliability, clear logging, and easy config changes.

---
**End of spec.**  
Ready for implementation.
