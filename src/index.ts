import { loadConfig, utcClock } from "./config.ts";
import { createOnPump } from "./pumpfun.ts";
import { runOnce } from "./run.ts";
import { startServer } from "./server.ts";

const root = process.cwd();
const command = process.argv[2] ?? "serve";
let inFlight = false;

async function tick(reason: string): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const result = await runOnce({ root, create: createOnPump });
    console.log(`${reason} ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error);
  } finally {
    inFlight = false;
  }
}

if (command === "once") {
  const result = await runOnce({ root, create: createOnPump });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} else if (command === "serve") {
  startServer(root);
  setInterval(() => {
    const config = loadConfig(root);
    if (config.dryRun) return;
    if (utcClock(new Date()) !== config.dailyTimeUtc) return;
    void tick("scheduled");
  }, 20_000);
  console.log("scheduler armed. dry_run launches only when you run: npm run once");
} else {
  console.error("Use: npm run once   or   npm run serve");
  process.exit(1);
}
