# Pump.fun Test Deployer — Handoff Spec
**For Grok in VS Code**  
**Purpose: Safe end-to-end test of the daily deployer logic before touching the real launchpad**

## Goal
One automated memecoin launch per day on **pump.fun** (Solana).  
Random pre-generated metadata (name, ticker, lore, image).  
1 initial/dev buy + 3–4 fast follow-up buys.  
Timed exit/recycle of remaining tokens (adjustable).  
Validate the full loop (selector → deploy → bundle → log → exit) without risking the main platform.

## Scope
- **Chain**: Solana only (pump.fun bonding curve)
- **No other chains**
- Reuse the same coin pool, config style, logger, and exit logic as the main plan
- Prefer existing SDKs or well-known launch helpers over raw instruction building where practical

## Recommended Libraries / Approaches
Pick one and stick to it:

1. **@nirholas/pump-sdk** (cleanest instruction-level control)  
   - `createV2Instruction` or `createV2AndBuyInstructions` for launch + initial buy
   - Separate buy instructions for follow-ups
2. **Higher-level launch packages** (faster to wire):
   - `@bilix-software/pump-fun-token-launcher`
   - Or any maintained pump.fun launcher that supports initial buy
3. **API route** (if you want less on-chain code):
   - Services that expose create + optional dev buy + optional Jito bundle  
   (pumpdev, pumpapi, launchpad.trade style endpoints)

**Jito bundles** are optional but recommended for the initial + fast buys so they land together.

## High-Level Architecture

```
[Daily Scheduler]
  → [Selector]          // unused coin from pool
  → [Metadata Uploader] // image + JSON → URI (IPFS or simple host)
  → [Deployer]          // pump.fun create + single initial buy
  → [Fast Bundler]      // 3–4 additional buys ASAP (or Jito bundle)
  → [Logger]
  → [Notifier]          // optional

[Exit Scheduler]
  → [Exit Checker]
  → [Seller]            // sell remaining on bonding curve
  → [Logger]
```

## 1. Coin Pool
Same format as main spec. Example:

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

## Metadata & Image Notes (pump.fun specific)

pump.fun expects a metadata URI pointing to a JSON file (usually on IPFS). The image and description are locked at launch.

### Required JSON shape
```json
{
  "name": "Sleepy Banana",
  "symbol": "SLPBN",
  "description": "A banana that only trades at night.",
  "image": "https://ipfs.io/ipfs/bafybei...",
  "showName": true,
  "createdOn": "https://pump.fun"
}
```

- `description` = the short lore line from the coin pool.
- Social fields (`twitter`, `telegram`, `website`) can be omitted or left empty.
- Image must be square, high-contrast, and load quickly (PNG/JPG, ideally ≤1 MB).

### Upload flow (in `metadata.ts`)
1. Read the local image from `coin.image_path`.
2. Upload image to IPFS (Pinata, pump.fun `/api/ipfs`, or any reliable host) → get image URI.
3. Build the JSON above with the image URI.
4. Upload the JSON to IPFS → get final `metadataUri`.
5. Pass `metadataUri` into the pump.fun create call.

**Notes for the agent:**
- Pre-generated images in the coin pool are preferred (matches how most volume deployers work).
- Metadata is immutable after launch — no updates later.
- Prefer Pinata or pump.fun’s own IPFS endpoint so images appear immediately.
- Keep descriptions to one short line.

## 2. Config (`config.json`)

```json
{
  "platform": "pumpfun",
  "initial_buy": {
    "sol": 0.15
  },
  "fast_bundle": {
    "count": 4,
    "total_sol": 0.4,
    "mode": "as_fast_as_possible",
    "use_jito": true
  },
  "exit": {
    "enabled": true,
    "hours_after_launch": 24,
    "check_interval_minutes": 60
  },
  "daily_time_utc": "08:00",
  "dry_run": false,
  "rpc_url": "https://api.mainnet-beta.solana.com",
  "priority_fee_lamports": 100000
}
```

- Amounts in SOL (easier on pump.fun).
- `use_jito` can be toggled.
- Exit hours fully adjustable.

## 3. Core Modules

| Module | Responsibility |
|--------|----------------|
| `scheduler` | Daily launch + periodic exit checks |
| `selector` | Picks unused coin |
| `metadata.ts` | Uploads image + builds metadata JSON URI |
| `deployer/pumpfun.ts` | Create token + single initial buy |
| `fastBundler.ts` | 3–4 buys ASAP or via Jito bundle |
| `seller.ts` | Sells remaining tokens on the curve |
| `logger.ts` | Deployment + exit records |
| `notifier.ts` | Optional announcement |

## 4. Interfaces

```ts
interface DeployParams {
  coin: Coin;
  initialBuySol: number;
  metadataUri: string;
}

interface DeployResult {
  success: boolean;
  mint?: string;          // token address
  txHash?: string;
  error?: string;
}

interface Position {
  coin_id: string;
  mint: string;
  wallets: string[];
  launched_at: string;
  exited: boolean;
  recovered_sol?: number;
}
```

## 5. Buy Structure

1. **Single initial / dev buy**  
   Included in the create transaction (or first transaction of a Jito bundle).
2. **3–4 fast follow-up buys**  
   - Prefer Jito bundle (create + initial + follow-ups in one atomic bundle) when `use_jito: true`.  
   - Otherwise send immediately after confirmation with minimal delay.  
   - Separate wallets from the creator/initial-buy wallet.

## 6. Exit / Recycle

- After `exit.hours_after_launch`, sell all remaining tokens held by the buy wallets back on the pump.fun bonding curve.
- Funds return to the same wallets for the next test cycle.
- Config-driven (hours + enabled flag).

## 7. Main Daily Loop (pseudocode)

```ts
async function runDaily() {
  const coin = await selector.pickUnusedCoin();
  const metadataUri = await metadata.upload(coin);

  const deployResult = await deployer.deploy({
    coin,
    initialBuySol: config.initial_buy.sol,
    metadataUri
  });

  if (!deployResult.success) {
    await logger.recordFailure(coin, deployResult.error);
    return;
  }

  if (!config.fast_bundle.use_jito) {
    await fastBundler.execute({
      mint: deployResult.mint!,
      count: config.fast_bundle.count,
      totalSol: config.fast_bundle.total_sol
    });
  }
  // If use_jito=true, the follow-up buys were already included in the bundle

  await logger.recordSuccess(coin, deployResult);
  await selector.markUsed(coin.id, deployResult.mint);
}
```

## 8. Exit Loop

```ts
async function runExitCheck() {
  if (!config.exit.enabled) return;

  const open = await logger.getOpenPositions();
  const cutoff = Date.now() - config.exit.hours_after_launch * 3600 * 1000;

  for (const pos of open) {
    if (new Date(pos.launched_at).getTime() < cutoff && !pos.exited) {
      const result = await seller.sellRemaining(pos);
      await logger.markExited(pos.coin_id, result);
    }
  }
}
```

## 9. Wallet Setup
- 1 creator / initial-buy wallet
- 3–4 additional buy wallets
- All funded with enough SOL for buys + fees + priority fees
- Same wallets used for exit sells
- Keys only in `.env`

## 10. Logger
Same style as main spec. Track:
- mint address
- launch tx
- bundle / follow-up txs
- exit txs + recovered SOL
- timestamps

## 11. Safety & Ops
- `dry_run` mode (log only, no txs)
- Small SOL amounts for testing
- Easy kill switch
- Clear logging of every step
- Start with one manual run before enabling the scheduler
- Never reuse a coin from the pool

## 12. Suggested File Structure

```
/pumpfun-test-deployer
  /src
    index.ts
    selector.ts
    metadata.ts
    fastBundler.ts
    seller.ts
    logger.ts
    /deployer
      pumpfun.ts
  /data
    coins.json
    deployments.json
  /images
  config.json
  .env.example
  README.md
```

## 13. Handoff Notes for the Agent
- This is a **test harness** for pump.fun only.
- Prefer `@nirholas/pump-sdk` or a maintained launcher package.
- Support both “create + immediate buys” and “Jito bundle” paths (config flag).
- Metadata upload must produce a valid URI that pump.fun can read (image + name/symbol/description). Follow the JSON shape and upload flow in the Metadata & Image Notes section.
- Exit must sell on the bonding curve (not assume AMM).
- Keep the same config-driven exit timing and coin-pool logic as the main plan.
- Focus on reliability and clear logs so the flow can be verified before porting to the real launchpad factories.
- Use small SOL amounts.

---
**End of Pump.fun Test Spec.**  
Ready for implementation.
