// Content script : point d'entrée. Assemble la détection du composeur, la
// lecture-écriture dans Draft.js, le dialogue avec le service worker,
// l'interface des boutons et la dictée. Chacun de ces volets est un module voisin.
import { dictationAvailable, toggleDictation } from "./dictation.ts";
import { failureNote, holds, readText, writeText } from "./editor.ts";
import { enableDictation, findButton, findEditor, scanToolbars, watchToolbars } from "./toolbar.ts";
import { highlightChanges } from "./highlight.ts";
import { EDITOR_SELECTOR } from "./selectors.ts";
import { SHORTCUT } from "../shared/messages.ts";
import { finish, rescue, scheduleColorSync, setState, showTip } from "./ui.ts";
import { requestCorrection } from "./worker.ts";
import { normalize } from "../shared/text.ts";

async function onClick(button: HTMLButtonElement, toolbar: HTMLElement): Promise<void> {
  const editor = findEditor(toolbar);
  if (!editor) {
    showTip(button, "Zone de texte introuvable", "error");
    return;
  }
  await correctEditor(button, editor);
}

/** Correction en cours, par bouton : la dictée attend qu'elle se termine. */
const inFlight = new WeakMap<HTMLButtonElement, Promise<void>>();

/**
 * Dictée écrite dans le brouillon : la correction part d'elle-même, sur le
 * bouton voisin. Une correction lancée avant la fin de la dictée voit le
 * brouillon changer et n'écrit rien : on attend son issue, puis on corrige le
 * brouillon complet.
 */
async function onDictated(editor: HTMLElement): Promise<void> {
  const button = findButton(editor);
  if (!button) return;
  await inFlight.get(button);
  if (editor.isConnected) await correctEditor(button, editor);
}

async function correctEditor(button: HTMLButtonElement, editor: HTMLElement): Promise<void> {
  const original = readText(editor);
  if (!normalize(original)) {
    showTip(button, "Rien à corriger", "info");
    return;
  }

  setState(button, "loading");
  const run = correctDraft(button, editor, original).catch((err: unknown) => {
    // Exception du DOM en cours d'écriture (éditeur remonté par X, Range
    // invalide) : le bouton ne doit jamais rester bloqué en chargement.
    console.error("[xCorrect]", err);
    finish(button, "error", "Erreur inattendue : vérifie le brouillon avant de publier.", "error");
  });
  inFlight.set(button, run);
  await run;
  if (inFlight.get(button) === run) inFlight.delete(button);
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

  return rescue(button, `Remplacement impossible, ${failureNote(written)}`, result.text, "Texte corrigé");
}

// La couleur des icônes de X change avec le focus et le contenu du composeur.
for (const type of ["focusin", "focusout", "input"]) {
  document.addEventListener(type, scheduleColorSync, true);
}

watchToolbars((button, toolbar) => void onClick(button, toolbar));

// Le micro n'apparaît qu'une fois la dictée locale confirmée. La vérification
// est asynchrone et ne retarde pas le bouton de correction.
void dictationAvailable().then((available) => {
  if (!available) return;
  enableDictation((button, toolbar) => void toggleDictation(button, toolbar, (editor) => void onDictated(editor)));
});

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
