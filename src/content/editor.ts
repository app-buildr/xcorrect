// Lecture et écriture du texte dans l'éditeur Draft.js de X. C'est la partie la
// plus fragile du projet : elle dépend du fonctionnement interne de Draft.js,
// pas seulement de son DOM.
import { cleanSpaces, normalize } from "../shared/text.ts";
import { BLOCK_SELECTOR } from "./selectors.ts";

/**
 * Texte d'un nœud, émojis compris : X affiche les émojis comme des images
 * Twemoji dont seul l'attribut alt porte le caractère, ignoré par innerText.
 * Dans un bloc Draft.js, <br> ne sert qu'à matérialiser un bloc vide.
 */
function nodeText(node: Node, inBlock: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data;
  if (node instanceof HTMLImageElement) return node.alt;
  if (node instanceof HTMLBRElement) return inBlock ? "" : "\n";
  let out = "";
  for (const child of node.childNodes) out += nodeText(child, inBlock);
  return out;
}

export function readText(editor: HTMLElement): string {
  const blocks = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const text =
    blocks.length > 0 ? blocks.map((block) => nodeText(block, true)).join("\n") : nodeText(editor, false);
  return cleanSpaces(text).replace(/\n+$/, "");
}

/**
 * Sélectionne tout le texte en ancrant la sélection dans les nœuds texte,
 * comme le fait un vrai Ctrl+A. Une sélection ancrée sur le conteneur n'est
 * pas reconnue par Draft.js, qui garde alors sa sélection interne repliée.
 */
function selectAll(editor: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let first: Text | null = null;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.data.length === 0) continue;
    first ??= node;
    last = node;
  }
  const range = document.createRange();
  if (first && last) {
    range.setStart(first, 0);
    range.setEnd(last, last.data.length);
  } else {
    range.selectNodeContents(editor);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sélectionne tout le contenu puis attend que Draft.js ait pris en compte la
 * sélection : il ne l'observe qu'au travers de l'événement selectionchange,
 * émis de façon asynchrone par le navigateur.
 */
async function selectAllAndSync(editor: HTMLElement): Promise<void> {
  const synced = new Promise<void>((resolve) => {
    const timer = window.setTimeout(done, 250);
    function done(): void {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", done);
      resolve();
    }
    document.addEventListener("selectionchange", done);
  });
  editor.focus();
  selectAll(editor);
  await synced;
  await settle(80);
}

function paste(editor: HTMLElement, text: string): void {
  const transfer = new DataTransfer();
  transfer.setData("text/plain", text);
  editor.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
  );
}

async function replaceAll(editor: HTMLElement, text: string): Promise<boolean> {
  await selectAllAndSync(editor);
  paste(editor, text);
  await settle(120);
  return holds(editor, text);
}

/** L'éditeur contient `text`, à la mise en forme près. readText nettoie ses insécables : `text` aussi. */
export function holds(editor: HTMLElement, text: string): boolean {
  return normalize(readText(editor)) === normalize(cleanSpaces(text));
}

/**
 * Issue d'une écriture : le texte est en place, le brouillon d'origine a été
 * rétabli, ou l'éditeur ne contient plus ni l'un ni l'autre.
 */
export type WriteResult = "written" | "restored" | "broken";

/**
 * Remplace le contenu de l'éditeur en passant par le gestionnaire de collage
 * de Draft.js : c'est le seul chemin qui met à jour son état interne (celui
 * que X publie) et l'historique d'annulation. execCommand("insertText") ne
 * modifie que le DOM et laisse l'état interne sur l'ancien texte.
 * Si la sélection n'était pas encore synchronisée, le texte est ajouté à la
 * suite ; on recommence alors, chaque passage restant cohérent avec l'état.
 * En cas d'échec définitif, le brouillon d'origine est restauré, et l'appelant
 * apprend si cette restauration a elle-même réussi.
 */
export async function writeText(editor: HTMLElement, text: string, original: string): Promise<WriteResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await replaceAll(editor, text)) return "written";
  }
  if (holds(editor, original) || (await replaceAll(editor, original))) return "restored";
  return "broken";
}
