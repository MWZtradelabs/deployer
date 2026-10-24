import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Deployment } from "./types.ts";

export function logPath(root: string): string {
  return path.join(root, "data", "deployments.json");
}

export function readLog(root: string): Deployment[] {
  const file = logPath(root);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as Deployment[];
}

export function appendLog(root: string, entry: Deployment): void {
  const file = logPath(root);
  const all = readLog(root);
  all.push(entry);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n");
  renameSync(tmp, file);
}

export function launchedToday(entries: Deployment[], day: string): boolean {
  return entries.some((entry) => entry.success && !entry.dry_run && entry.timestamp.startsWith(day));
}
