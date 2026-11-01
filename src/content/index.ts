// Content script : point d'entrée. Assemble la détection du composeur, la
// lecture-écriture dans Draft.js, le dialogue avec le service worker et
// l'interface du bouton. Chacun de ces quatre volets est un module voisin.
import { holds, readText, writeText } from "./editor.ts";
import { findButton, findEditor, scanToolbars, watchToolbars } from "./toolbar.ts";
import { highlightChanges } from "./highlight.ts";
import { EDITOR_SELECTOR } from "./selectors.ts";
import { SHORTCUT } from "../shared/messages.ts";
import { finish, scheduleColorSync, setState, showTip } from "./ui.ts";
import { requestCorrection } from "./worker.ts";
import { normalize } from "../shared/text.ts";

async function onClick(button: HTMLButtonElement, toolbar: HTMLElement): Promise<void> {
  const editor = findEditor(toolbar);
  if (!editor) {
    showTip(button, "Zone de texte introuvable", "error");
    return;
  }

  const original = readText(editor);
  if (!normalize(original)) {
    showTip(button, "Rien à corriger", "info");
    return;
  }

  setState(button, "loading");
  try {
    await correctDraft(button, editor, original);
  } catch (err) {
    // Exception du DOM en cours d'écriture (éditeur remonté par X, Range
    // invalide) : le bouton ne doit jamais rester bloqué en chargement.
    console.error("[xCorrect]", err);
    finish(button, "error", "Erreur inattendue : vérifie le brouillon avant de publier.", "error");
  }
}

async function correctDraft(button: HTMLButtonElement, editor: HTMLElement, original: string): Promise<void> {
  const result = await requestCorrection(original);

  if (!result.ok) return finish(button, "error", result.error, "error");

  if (normalize(result.text) === normalize(original)) {
    return setState(button, "done");
  }

  // Pendant la requête, l'utilisateur a pu continuer à écrire, publier, ou
  // fermer le composeur : coller la correction effacerait son texte.
  if (!editor.isConnected || !holds(editor, original)) {
    return finish(button, "error", "Brouillon modifié pendant la correction : rien n'a été remplacé.", "error");
  }

  const written = await writeText(editor, result.text, original);
  if (written === "written") {
    highlightChanges(editor, original, result.text);
    return setState(button, "done");
  }

  const copied = await navigator.clipboard.writeText(result.text).then(
    () => true,
    // presse-papiers indisponible (fenêtre sans focus, permission refusée)
    () => false,
  );
  const outcome =
    written === "restored"
      ? "brouillon d'origine conservé"
      : "le brouillon a pu être altéré, vérifie-le avant de publier (Ctrl+Z pour annuler)";
  const message = copied
    ? `Remplacement impossible, ${outcome}. Texte corrigé copié dans le presse-papiers.`
    : `Remplacement impossible, ${outcome}. Réessaie.`;
  finish(button, "error", message, "error");
}

// La couleur des icônes de X change avec le focus et le contenu du composeur.
for (const type of ["focusin", "focusout", "input"]) {
  document.addEventListener(type, scheduleColorSync, true);
}

watchToolbars((button, toolbar) => void onClick(button, toolbar));

// Raccourci clavier : corrige le composeur qui a le focus, comme un clic sur son bouton.
chrome.runtime.onMessage.addListener((message: { type?: string } | undefined) => {
  if (message?.type !== SHORTCUT) return;
  const editor = document.activeElement?.closest<HTMLElement>(EDITOR_SELECTOR);
  if (!editor) return;
  // Un composeur qui vient de s'ouvrir n'a peut-être pas encore son bouton :
  // le balayage est fait tout de suite plutôt qu'à la prochaine image.
  scanToolbars();
  const button = findButton(editor);
  if (button && !button.disabled) button.click();
});
