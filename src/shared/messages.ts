// Contrat de messages entre le content script et le service worker. Isolé ici
// pour que ni l'un ni l'autre ne dépende du module de son interlocuteur.

export const CORRECT = "xcorrect:correct";

export type CorrectRequest = { type: typeof CORRECT; text: string };

export function isCorrectRequest(message: unknown): message is CorrectRequest {
  const m = message as Partial<CorrectRequest> | null;
  return m?.type === CORRECT && typeof m.text === "string";
}

/** Envoyé par le service worker à l'onglet actif quand le raccourci clavier est pressé. */
export const SHORTCUT = "xcorrect:shortcut";

export type CorrectResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Envoyé par la page d'options à son ouverture : relève tout de suite la dernière release. */
export const CHECK_UPDATE = "xcorrect:check-update";

export function isCheckUpdateRequest(message: unknown): boolean {
  return (message as { type?: unknown } | null)?.type === CHECK_UPDATE;
}
