import { readFileSync } from "node:fs";
import path from "node:path";

export interface TokenMetadataJson {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: true;
  createdOn: "https://pump.fun";
}

export function metadataJson(input: {
  name: string;
  symbol: string;
  description: string;
  image: string;
}): TokenMetadataJson {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    showName: true,
    createdOn: "https://pump.fun",
  };
}

interface PinataFile {
  data?: { cid?: string };
  error?: string;
}

async function pinFile(jwt: string, file: Blob, filename: string, fetchImpl: typeof fetch): Promise<string> {
  const form = new FormData();
  form.append("network", "public");
  form.append("file", file, filename);
  const response = await fetchImpl("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const json = (await response.json()) as PinataFile;
  if (!response.ok || !json.data?.cid) {
    throw new Error(json.error || `Pinata upload failed (${response.status}).`);
  }
  return json.data.cid;
}

/** Upload the coin image and the metadata JSON. Returns the metadata URI. */
export async function uploadMetadata(input: {
  root: string;
  imagePath: string;
  name: string;
  symbol: string;
  description: string;
  jwt: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const absolute = path.resolve(input.root, input.imagePath);
  const bytes = readFileSync(absolute);
  const imageCid = await pinFile(
    input.jwt,
    new Blob([bytes]),
    path.basename(absolute),
    fetchImpl,
  );
  const image = `https://ipfs.io/ipfs/${imageCid}`;
  const json = metadataJson({
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image,
  });
  const metaCid = await pinFile(
    input.jwt,
    new Blob([JSON.stringify(json)], { type: "application/json" }),
    "metadata.json",
    fetchImpl,
  );
  return `https://ipfs.io/ipfs/${metaCid}`;
}
