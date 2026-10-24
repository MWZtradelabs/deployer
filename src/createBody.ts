import type { CreateBody } from "./types.ts";

/**
 * Body for one pump.fun create. PumpPortal treats a JSON array as a Jito bundle
 * of several wallets. This function returns one object and refuses an array.
 */
export function assertCreatorBuy(creatorBuySol: number, maxCreatorBuySol: number): void {
  if (!Number.isFinite(creatorBuySol) || creatorBuySol <= 0) {
    throw new Error("Set initial_buy_sol. Pump.fun requires a creator buy on the create transaction.");
  }
  if (creatorBuySol > maxCreatorBuySol) {
    throw new Error(
      `Creator buy ${creatorBuySol} SOL is above max_creator_buy_sol ${maxCreatorBuySol}.`,
    );
  }
}

export function buildCreateBody(input: {
  publicKey: string;
  name: string;
  symbol: string;
  uri: string;
  mint: string;
  creatorBuySol: number;
  maxCreatorBuySol: number;
  slippagePct: number;
  priorityFeeSol: number;
}): CreateBody {
  if (!input.publicKey) throw new Error("Creator wallet is missing.");
  assertCreatorBuy(input.creatorBuySol, input.maxCreatorBuySol);
  const body: CreateBody = {
    publicKey: input.publicKey,
    action: "create",
    tokenMetadata: {
      name: input.name,
      symbol: input.symbol,
      uri: input.uri,
    },
    mint: input.mint,
    denominatedInSol: "true",
    amount: input.creatorBuySol,
    slippage: input.slippagePct,
    priorityFee: input.priorityFeeSol,
    pool: "pump",
  };
  if (Array.isArray(body)) throw new Error("Refusing a bundle.");
  return body;
}

/** Wire format for PumpPortal. An array would be a multi-wallet bundle, so that shape is refused. */
export function serializeCreate(body: CreateBody): string {
  const wire = JSON.stringify(body);
  const parsed: unknown = JSON.parse(wire);
  if (Array.isArray(parsed) || parsed === null || typeof parsed !== "object") {
    throw new Error("Refusing a bundle. The create request is one object.");
  }
  return wire;
}
