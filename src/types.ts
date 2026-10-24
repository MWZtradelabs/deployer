export interface Coin {
  id: string;
  name: string;
  ticker: string;
  lore: string;
  image_path: string;
  used: boolean;
  used_on_chain: string | null;
  deployed_at: string | null;
  contract_address: string | null;
}

export interface Config {
  platform: "pumpfun";
  initialBuySol: number;
  maxCreatorBuySol: number;
  slippagePct: number;
  priorityFeeSol: number;
  dailyTimeUtc: string;
  dryRun: boolean;
  rpcUrl: string;
}

/** One create transaction. This object is sent as a JSON object, never as an array. */
export interface CreateBody {
  publicKey: string;
  action: "create";
  tokenMetadata: { name: string; symbol: string; uri: string };
  mint: string;
  denominatedInSol: "true";
  amount: number;
  slippage: number;
  priorityFee: number;
  pool: "pump";
}

export interface Deployment {
  coin_id: string;
  name: string;
  ticker: string;
  chain: "solana";
  platform: "pumpfun";
  mint: string | null;
  metadata_uri: string | null;
  launch_tx: string | null;
  creator_buy_sol: number;
  timestamp: string;
  success: boolean;
  dry_run: boolean;
  error?: string;
}

export interface RunResult {
  ok: boolean;
  dryRun: boolean;
  skipped?: boolean;
  coinId?: string;
  name?: string;
  ticker?: string;
  mint?: string | null;
  signature?: string | null;
  creatorBuySol?: number;
  error?: string;
}
