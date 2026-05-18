import { readFile, writeFile } from "node:fs/promises";
import type { CheckResult, StoredState } from "./types.js";

const emptyState: StoredState = { pages: {} };

export async function loadState(stateFile: string): Promise<StoredState> {
  try {
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw) as StoredState;
    return parsed.pages ? parsed : emptyState;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyState;
    throw error;
  }
}

export async function saveState(stateFile: string, state: StoredState): Promise<void> {
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function pageKey(result: Pick<CheckResult, "siteId" | "url">): string {
  return `${result.siteId}::${result.url}`;
}

export function shouldAlert(result: CheckResult, state: StoredState): boolean {
  if (result.status !== "in_stock") return false;

  const previous = state.pages[pageKey(result)];
  return previous?.status !== "in_stock";
}

export function recordResult(result: CheckResult, state: StoredState, alertedAt?: string): void {
  const key = pageKey(result);
  const previous = state.pages[key];

  state.pages[key] = {
    status: result.status,
    matchedPattern: result.matchedPattern,
    title: result.title,
    checkedAt: result.checkedAt,
    alertedAt: alertedAt ?? previous?.alertedAt
  };
}
