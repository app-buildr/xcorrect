// Page d'options : réglages, bandeau de mise à jour et rappel d'utilisation.
import { toAccountType } from "../shared/config.ts";
import { CHECK_UPDATE } from "../shared/messages.ts";
import { LATEST_VERSION_KEY, getLatestVersion, getSettings, setAccountType, setApiKey } from "../shared/storage.ts";
import { UPDATE_GUIDE_URL, isNewer } from "../shared/version.ts";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = byId<HTMLFormElement>("settings");
const apiKeyInput = byId<HTMLInputElement>("apiKey");
const accountTypeSelect = byId<HTMLSelectElement>("accountType");
const statusEl = byId<HTMLParagraphElement>("status");
const banner = byId<HTMLDivElement>("update");
const installed = chrome.runtime.getManifest().version;

async function load(): Promise<void> {
  const { apiKey, accountType } = await getSettings();
  apiKeyInput.value = apiKey;
  accountTypeSelect.value = accountType;
}

async function save(): Promise<void> {
  const apiKey = apiKeyInput.value.trim();
  if (apiKey && !apiKey.startsWith("sk-ant-")) {
    setStatus("Cette clé ne ressemble pas à une clé Anthropic (préfixe sk-ant-).", "error");
    return;
  }
  await Promise.all([setApiKey(apiKey), setAccountType(toAccountType(accountTypeSelect.value))]);
  setStatus(
    apiKey ? "Enregistré." : "Enregistré, mais aucune clé : la correction restera inactive.",
    "ok",
  );
}

function setStatus(message: string, kind: "ok" | "error"): void {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function renderUpdate(): Promise<void> {
  const latest = await getLatestVersion();
  banner.hidden = !isNewer(latest, installed);
  if (!banner.hidden) byId("updateMessage").textContent = `Version ${latest} publiée, vous avez la ${installed}.`;
}

/**
 * Raccourci réellement attribué : il dépend de la plateforme, l'utilisateur
 * peut le changer, et Chrome n'en attribue aucun en cas de conflit.
 */
async function renderShortcut(): Promise<void> {
  const command = (await chrome.commands.getAll()).find((c) => c.name === "correct");
  if (!command?.shortcut) {
    byId("shortcutHint").hidden = false;
    return;
  }
  const kbd = document.createElement("kbd");
  kbd.textContent = command.shortcut;
  byId("shortcut").append(", ou pressez ", kbd);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

byId<HTMLAnchorElement>("updateLink").href = UPDATE_GUIDE_URL;
byId("version").textContent = `Version ${installed}`;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && LATEST_VERSION_KEY in changes) void renderUpdate();
});

void load();
void renderUpdate();
void renderShortcut();
// La release est revérifiée à chaque ouverture ; un changement arrive par onChanged.
void chrome.runtime.sendMessage({ type: CHECK_UPDATE }).catch(() => {});
