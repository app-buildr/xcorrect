// Service worker : seul composant à connaître la clé API et à parler à Claude.
import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "../shared/storage.ts";
import { requestBudgetMsFor } from "../shared/config.ts";
import { SHORTCUT, isCorrectRequest, type CorrectResponse } from "../shared/messages.ts";
import { readCorrection } from "./sanitize.ts";
import { describeError } from "./errors.ts";
import { correctionRequest } from "./prompt.ts";
import { watchUpdates } from "./updates.ts";

watchUpdates();

// Clic sur l'icône de l'extension : ouvre la page d'options.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

// Raccourci clavier : relayé à l'onglet actif, dont le content script sait quel
// composeur a le focus. Hors de X, aucun content script ne répond : rien à faire.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "correct" || tab?.id === undefined) return;
  chrome.tabs.sendMessage(tab.id, { type: SHORTCUT }).catch(() => {});
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (r: CorrectResponse) => void) => {
    if (!isCorrectRequest(message)) return false;
    handleCorrect(message.text).then(sendResponse, (err: unknown) =>
      sendResponse({ ok: false, error: describeError(err) }),
    );
    return true; // réponse asynchrone
  },
);

// Le rejet est converti en réponse d'erreur par l'appelant, inutile de le
// rattraper ici.
async function handleCorrect(text: string): Promise<CorrectResponse> {
  // Le plafond dépend du type de compte configuré dans les options.
  const settings = await getSettings();
  if (text.length > settings.maxInputChars) {
    return {
      ok: false,
      error: `Texte trop long pour être corrigé d'un bloc (${settings.maxInputChars} caractères maximum).`,
    };
  }

  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: "Clé API manquante : ouvre les options de xCorrect." };
  }

  return { ok: true, text: await correct(text, apiKey) };
}

async function correct(text: string, apiKey: string): Promise<string> {
  // Dimensionné sur la longueur du texte, une fois le plafond validé.
  const budgetMs = requestBudgetMsFor(text);
  // Le signal borne la requête entière, le délai du SDK seulement l'arrivée des
  // en-têtes. En leur donnant la même valeur, les deux se déclenchent ensemble
  // et le dépassement remonte tantôt par l'un tantôt par l'autre. La marge fait
  // gagner le signal à coup sûr : un seul chemin d'erreur pour un seul cas.
  const clientTimeoutMs = budgetMs + 2_000;

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    // Une seule reprise. Les erreurs réseau transitoires (429, 5xx, connexion
    // rompue) restent réessayées par le SDK ; l'abandon du signal, lui, ne l'est
    // jamais, donc une génération abandonnée n'est pas refacturée.
    maxRetries: 1,
    timeout: clientTimeoutMs,
  });

  // En streaming, le délai du SDK ne couvre que l'arrivée des en-têtes : une
  // génération longue n'est jamais relancée, donc jamais facturée deux fois. Le
  // signal borne la lecture du flux et n'est pas retenté par le SDK.
  const signal = AbortSignal.timeout(budgetMs);
  const stream = client.messages.stream(correctionRequest(text), { signal });

  // Le SDK attend la durée de retry-after d'un 429 avant sa reprise, sans
  // surveiller le signal : finalMessage() ne se réglerait qu'après. La course
  // contre le signal tient le budget dans tous les cas, attente comprise, et le
  // worker répond toujours avant le filet de la page.
  const expired = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

  let response;
  try {
    response = await Promise.race([stream.finalMessage(), expired]);
  } catch (err) {
    // Le SDK convertit l'abandon du signal en APIUserAbortError ; AbortSignal
    // .timeout signale un TimeoutError si l'erreur remonte sans conversion.
    const aborted =
      err instanceof Anthropic.APIUserAbortError ||
      (err instanceof DOMException && err.name === "TimeoutError");
    if (aborted) {
      throw new Error(`Délai dépassé après ${Math.round(budgetMs / 1000)} s, brouillon inchangé.`);
    }
    throw err;
  }

  return readCorrection(response, text);
}
