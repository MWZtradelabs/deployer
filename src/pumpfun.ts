import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { buildCreateBody, serializeCreate } from "./createBody.ts";
import { uploadMetadata } from "./metadata.ts";
import type { CreateRequest } from "./run.ts";

/**
 * Launch one coin on pump.fun.
 * The request is a single create from the creator wallet. There is no second wallet and no bundle.
 */
export async function createOnPump(
  request: CreateRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ mint: string; signature: string; metadataUri: string }> {
  const signer = Keypair.fromSecretKey(bs58.decode(request.secretKey));
  const mintKey = Keypair.generate();
  const metadataUri = await uploadMetadata({
    root: request.root,
    imagePath: request.imagePath,
    name: request.name,
    symbol: request.symbol,
    description: request.description,
    jwt: request.pinataJwt,
    fetchImpl,
  });
  const body = buildCreateBody({
    publicKey: signer.publicKey.toBase58(),
    name: request.name,
    symbol: request.symbol,
    uri: metadataUri,
    mint: mintKey.publicKey.toBase58(),
    creatorBuySol: request.creatorBuySol,
    maxCreatorBuySol: request.maxCreatorBuySol,
    slippagePct: request.slippagePct,
    priorityFeeSol: request.priorityFeeSol,
  });
  const response = await fetchImpl("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serializeCreate(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create transaction was refused (${response.status}): ${text.slice(0, 300)}`);
  }
  const tx = VersionedTransaction.deserialize(new Uint8Array(await response.arrayBuffer()));
  tx.sign([mintKey, signer]);
  const connection = new Connection(request.rpcUrl, "confirmed");
  const signature = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  const confirmed = await connection.confirmTransaction(signature, "confirmed");
  if (confirmed.value.err) throw new Error(`Create transaction failed: ${JSON.stringify(confirmed.value.err)}`);
  return { mint: mintKey.publicKey.toBase58(), signature, metadataUri };
}
