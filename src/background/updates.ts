// Service worker : relève la dernière release publiée sur GitHub et signale une
// mise à jour par un « ! » rouge sur l'icône de l'extension.
import { isCheckUpdateRequest } from "../shared/messages.ts";
import { LATEST_VERSION_KEY, clearLatestVersion, getLatestVersion, setLatestVersion } from "../shared/storage.ts";
import { RELEASES_URL, UPDATE_CHECK_MINUTES, isNewer, parseVersion } from "../shared/version.ts";

/**
 * Simulation pour tester l'alerte : `FAKE_LATEST_VERSION=9.9.9 npm run build`
 * fait passer cette version pour la dernière release. Vide dans un build normal.
 */
declare const __FAKE_LATEST_VERSION__: string;

const ALARM = "xcorrect:update-check";
const RED = "#f4212e";
const TITLE = "xCorrect : options";

/** Hors ligne, dépôt sans release ou réponse illisible : la version déjà relevée reste. */
async function checkLatestVersion(): Promise<void> {
  const fake = parseVersion(__FAKE_LATEST_VERSION__);
  if (fake) return setLatestVersion(fake);
  let body: unknown;
  try {
    const response = await fetch(RELEASES_URL, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    // Aucune release publiée : rien à signaler, y compris une version relevée
    // auparavant (release supprimée, ou simulation d'un build précédent).
    if (response.status === 404) return clearLatestVersion();
    if (!response.ok) return;
    body = await response.json();
  } catch {
    return;
  }
  const latest = parseVersion((body as { tag_name?: unknown } | null)?.tag_name);
  if (latest) await setLatestVersion(latest);
}

async function refreshBadge(): Promise<void> {
  const installed = chrome.runtime.getManifest().version;
  const latest = await getLatestVersion();
  if (isNewer(latest, installed)) {
    await chrome.action.setBadgeBackgroundColor({ color: RED });
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({ title: `${TITLE} (version ${latest} disponible)` });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: TITLE });
}

export function watchUpdates(): void {
  const check = () => void checkLatestVersion().finally(() => void refreshBadge());
  // Le badge se vide au redémarrage du navigateur, et une installation change
  // la version installée : dans les deux cas il est recalculé.
  const schedule = () => {
    void chrome.alarms.create(ALARM, { periodInMinutes: UPDATE_CHECK_MINUTES });
    check();
  };
  chrome.runtime.onInstalled.addListener(schedule);
  chrome.runtime.onStartup.addListener(schedule);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && LATEST_VERSION_KEY in changes) void refreshBadge();
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (r: boolean) => void) => {
    if (!isCheckUpdateRequest(message)) return false;
    void checkLatestVersion().finally(() => sendResponse(true));
    return true; // réponse asynchrone
  });
}
