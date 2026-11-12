// Normalisation du texte du brouillon. Fonctions pures, sans dépendance au DOM :
// elles s'exécutent et se testent isolément.

/**
 * Les espaces insécables (U+00A0) que le navigateur insère de lui-même en fin
 * de ligne ou entre deux espaces redeviennent des espaces normales. Celles qui
 * précèdent un signe double ou suivent un guillemet ouvrant sont conservées.
 */
export function cleanSpaces(text: string): string {
  return text.replace(/(?<!\u00AB)\u00A0(?![?!:;\u00BB])/g, " ");
}

/**
 * Forme de comparaison : espaces ordinaires fusionnées et rognées ligne par
 * ligne. Les sauts de ligne et les espaces insécables sont conservés, pour
 * détecter une correction typographique ou un retour à la ligne perdu.
 */
export function normalize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/^ | $/g, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/**
 * Assemble les segments renvoyés par la reconnaissance vocale. Chrome découpe
 * la dictée en résultats successifs, avec ou sans espace en tête selon le
 * moteur : chaque segment est rogné, puis tous sont joints par une espace.
 */
export function joinTranscript(segments: readonly string[]): string {
  return segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Texte à coller en fin de brouillon pour y ajouter la dictée : précédé d'une
 * espace, sauf si le brouillon est vide ou finit déjà par un blanc (espace,
 * saut de ligne tapé juste avant de dicter). Vide si rien n'a été dicté.
 */
export function dictationSuffix(draft: string, dictated: string): string {
  const text = dictated.trim();
  if (!text) return "";
  return draft === "" || /\s$/.test(draft) ? text : ` ${text}`;
}
