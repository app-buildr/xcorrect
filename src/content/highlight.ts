// Soulignement passager des mots corrigés. Passe par la CSS Custom Highlight
// API, qui dessine sur des Range sans toucher au DOM : Draft.js ne voit rien,
// son état et l'historique d'annulation restent intacts.
import { correctedTokens } from "../shared/diff.ts";

const NAME = "xcorrect";
const DURATION_MS = 3000;

let clearTimer = 0;

function clear(): void {
  window.clearTimeout(clearTimer);
  CSS.highlights.delete(NAME);
  document.removeEventListener("input", clear, true);
}

/** Texte visible de l'éditeur, avec pour chaque caractère son nœud et son décalage. */
function textIndex(editor: HTMLElement): { text: string; nodes: Text[]; starts: number[] } {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  return { text, nodes, starts };
}

/** Position (nœud, décalage) du caractère d'indice `offset` dans le texte indexé. */
function locate(index: ReturnType<typeof textIndex>, offset: number): [Text, number] {
  let k = index.starts.length - 1;
  while (k > 0 && index.starts[k]! > offset) k--;
  return [index.nodes[k]!, offset - index.starts[k]!];
}

/**
 * Souligne dans l'éditeur les mots que la correction a changés par rapport au
 * brouillon. Les mots sont retrouvés dans l'ordre du texte, chacun cherché
 * après le précédent ; les émojis, rendus en images, sont simplement sautés.
 */
export function highlightChanges(editor: HTMLElement, original: string, corrected: string): void {
  clear();
  const index = textIndex(editor);
  const ranges: Range[] = [];
  let cursor = 0;
  for (const token of correctedTokens(original, corrected)) {
    const at = index.text.indexOf(token.text, cursor);
    if (at < 0) continue;
    cursor = at + token.text.length;
    if (!token.changed) continue;
    const range = document.createRange();
    range.setStart(...locate(index, at));
    range.setEnd(...locate(index, cursor - 1));
    range.setEnd(range.endContainer, range.endOffset + 1);
    ranges.push(range);
  }
  if (ranges.length === 0) return;
  CSS.highlights.set(NAME, new Highlight(...ranges));
  clearTimer = window.setTimeout(clear, DURATION_MS);
  // Reprendre la frappe efface le soulignement aussitôt.
  document.addEventListener("input", clear, true);
}
