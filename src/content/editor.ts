// Lecture et écriture du texte dans l'éditeur Draft.js de X. C'est la partie la
// plus fragile du projet : elle dépend du fonctionnement interne de Draft.js,
// pas seulement de son DOM.
import { cleanSpaces, dictationSuffix, normalize } from "../shared/text.ts";
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

/** Texte du brouillon, blocs vides de fin compris : un saut de ligne tapé en dernier y figure. */
function readDraft(editor: HTMLElement): string {
  const blocks = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const text =
    blocks.length > 0 ? blocks.map((block) => nodeText(block, true)).join("\n") : nodeText(editor, false);
  return cleanSpaces(text);
}

export function readText(editor: HTMLElement): string {
  return readDraft(editor).replace(/\n+$/, "");
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

/**
 * Pose le curseur en fin de brouillon, dans le dernier bloc. Un bloc vide n'a
 * pas de nœud texte : le curseur va alors dans son élément le plus profond
 * marqué d'une clé Draft.js, là où le navigateur le mettrait sur un clic.
 */
function caretAtEnd(editor: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const block = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).at(-1) ?? editor;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let tail: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.data.length > 0) tail = node;
  }
  const range = document.createRange();
  if (tail) {
    range.setStart(tail, tail.data.length);
  } else {
    const leaf = Array.from(block.querySelectorAll<HTMLElement>("[data-offset-key]")).at(-1);
    range.setStart(leaf ?? block, 0);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Place la sélection puis attend que Draft.js l'ait prise en compte : il ne
 * l'observe qu'au travers de l'événement selectionchange, émis de façon
 * asynchrone par le navigateur.
 */
async function selectAndSync(editor: HTMLElement, place: (editor: HTMLElement) => void): Promise<void> {
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
  place(editor);
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
  await selectAndSync(editor, selectAll);
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

/** Ce qu'il advient du brouillon après une écriture manquée, pour le message d'erreur. */
export function failureNote(result: Exclude<WriteResult, "written">): string {
  return result === "restored"
    ? "brouillon d'origine conservé"
    : "le brouillon a pu être altéré, vérifie-le avant de publier (Ctrl+Z pour annuler)";
}

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

/**
 * Ajoute `dictated` à la fin du brouillon sans toucher au reste : curseur en
 * fin de dernier bloc, puis collage du seul texte ajouté. Une seule entrée
 * d'historique, et un saut de ligne tapé juste avant reste en place. Si le
 * collage n'atterrit pas en fin de brouillon (curseur mal repris par Draft.js),
 * le brouillon attendu est réécrit en entier par writeText, avec ses garanties.
 */
export async function appendText(editor: HTMLElement, dictated: string): Promise<WriteResult> {
  const draft = readDraft(editor);
  const suffix = dictationSuffix(draft, dictated);
  if (!suffix) return "written";
  const expected = draft + suffix;

  await selectAndSync(editor, caretAtEnd);
  paste(editor, suffix);
  await settle(120);
  if (holds(editor, expected)) return "written";
  return writeText(editor, expected, draft.replace(/\n+$/, ""));
}
