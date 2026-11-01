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
