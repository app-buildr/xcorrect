// Assainissement de la réponse du modèle. Fonctions pures, sans dépendance au
// SDK, à Chrome ni au DOM : elles s'exécutent et se testent isolément.
import { keepOriginalLayout, sameSign } from "../shared/diff.ts";
import { cleanSpaces } from "../shared/text.ts";

/** Retire des balises <tweet> que le modèle aurait recopiées. */
export function stripTags(value: string): string {
  return value.replace(/^\s*<tweet>\s*/i, "").replace(/\s*<\/tweet>\s*$/i, "");
}

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["«", "»"],
  ["“", "”"],
  ["'", "'"],
  ["’", "’"],
];

/**
 * Retire les guillemets seulement si le modèle les a ajoutés : si le texte
 * d'origine commence et finit déjà par des guillemets, ils lui appartiennent,
 * même si le modèle en a changé le style (`"…"` devenu `« … »`).
 */
export function stripAddedQuotes(value: string, original: string): string {
  // Les guillemets ouvrants étant tous distincts, une seule paire peut envelopper
  // la réponse.
  const pair = QUOTE_PAIRS.find(
    ([open, close]) => value.length > 1 && value.startsWith(open) && value.endsWith(close),
  );
  if (!pair) return value;
  const [open, close] = pair;
  const trimmedOriginal = original.trim();
  if (trimmedOriginal.length > 1 && sameSign(trimmedOriginal[0]!, open) && sameSign(trimmedOriginal.at(-1)!, close)) {
    return value;
  }
  return value.slice(open.length, -close.length).trim();
}

/**
 * Garde-fou contre une réponse qui n'est pas une correction (réponse à une
 * question, traduction, commentaire) : la longueur doit rester du même ordre.
 */
export function looksLikeCorrection(output: string, original: string): boolean {
  const ratio = output.length / Math.max(original.length, 1);
  return ratio >= 0.5 && ratio <= 2 + 40 / Math.max(original.length, 1);
}

/** Forme minimale d'une réponse de l'API, pour rester indépendant du SDK. */
export type ModelReply = {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
};

/**
 * Texte corrigé d'une réponse, ou erreur au message affichable. Partagé par le
 * service worker et l'eval : ce que l'eval note est ce que l'extension écrirait.
 */
export function readCorrection(reply: ModelReply, original: string): string {
  if (reply.stop_reason === "refusal") throw new Error("Le modèle a refusé de traiter ce texte.");
  if (reply.stop_reason === "max_tokens") {
    throw new Error("Réponse incomplète du modèle, brouillon inchangé.");
  }
  const raw = reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  // Espaces, sauts de ligne, guillemets et apostrophes : ceux du brouillon, quoi
  // qu'en fasse le modèle. Le prompt le demande, ce réalignement le garantit.
  // Pas de trim final : il effacerait les sauts de ligne de tête ou de queue que
  // l'alignement vient de rétablir.
  // cleanSpaces : les insécables que l'éditeur ne garderait pas sont retirées
  // dès ici, sinon la relecture après collage ne retrouverait jamais le texte.
  const output = cleanSpaces(keepOriginalLayout(original, stripAddedQuotes(stripTags(raw), original)));
  if (!output.trim()) throw new Error("Réponse vide du modèle.");
  if (!looksLikeCorrection(output, original)) {
    throw new Error("Réponse inattendue du modèle, brouillon inchangé.");
  }
  return output;
}
