// Dialogue avec le service worker.
import { pageTimeoutMsFor } from "../shared/config.ts";
import { CORRECT, type CorrectRequest, type CorrectResponse } from "../shared/messages.ts";

export const SILENT_ERROR = "Le service de correction n'a pas répondu. Réessaie dans un instant.";
export const RELOADED_ERROR = "xCorrect a été mis à jour : actualise la page.";
export const TIMEOUT_ERROR = "Délai dépassé sans réponse de l'API. Réessaie.";

/**
 * L'échec de sendMessage recouvre deux cas : le service worker n'a pas répondu,
 * ou l'extension a été rechargée sous la page. Seul le premier laisse survivre
 * runtime.id.
 */
async function askWorker(request: CorrectRequest): Promise<CorrectResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(request)) as CorrectResponse | undefined;
    return response ?? { ok: false, error: SILENT_ERROR };
  } catch {
    return { ok: false, error: chrome.runtime?.id ? SILENT_ERROR : RELOADED_ERROR };
  }
}

export function requestCorrection(text: string): Promise<CorrectResponse> {
  // Dérivé de la même formule que le budget du worker : un filet figé finirait
  // par abandonner avant lui sur les textes longs.
  const netMs = pageTimeoutMsFor(text);
  let timer = 0;
  const expired = new Promise<CorrectResponse>((resolve) => {
    timer = window.setTimeout(() => resolve({ ok: false, error: TIMEOUT_ERROR }), netMs);
  });
  const answered = askWorker({ type: CORRECT, text });
  return Promise.race([answered, expired]).finally(() => window.clearTimeout(timer));
}
