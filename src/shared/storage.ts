// Accès aux données stockées par l'extension, partagé par le service worker et
// la page d'options. Les règles métier vivent dans config.ts.
import { MAX_INPUT_CHARS, toAccountType, type AccountType } from "./config.ts";

const DEFAULTS = { apiKey: "", accountType: "free" as AccountType };

export type Settings = { apiKey: string; accountType: AccountType; maxInputChars: number };

/** Tous les réglages en une lecture. */
export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(DEFAULTS)) as typeof DEFAULTS;
  const accountType = toAccountType(stored.accountType);
  return { apiKey: stored.apiKey, accountType, maxInputChars: MAX_INPUT_CHARS[accountType] };
}

export async function setApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ apiKey });
}

export async function setAccountType(accountType: AccountType): Promise<void> {
  await chrome.storage.local.set({ accountType });
}

/** Clé de stockage de la dernière version publiée, écoutée par le badge et les options. */
export const LATEST_VERSION_KEY = "latestVersion";

/** Dernière version publiée relevée sur GitHub, ou null si jamais relevée. */
export async function getLatestVersion(): Promise<string | null> {
  const stored = await chrome.storage.local.get({ [LATEST_VERSION_KEY]: null });
  const value = stored[LATEST_VERSION_KEY];
  return typeof value === "string" ? value : null;
}

export async function setLatestVersion(version: string): Promise<void> {
  await chrome.storage.local.set({ [LATEST_VERSION_KEY]: version });
}

export async function clearLatestVersion(): Promise<void> {
  await chrome.storage.local.remove(LATEST_VERSION_KEY);
}
