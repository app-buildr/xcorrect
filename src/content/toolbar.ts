// Détection des barres d'action de X et insertion du bouton.
import {
  BUTTON_CLASS,
  EDITOR_SELECTOR,
  TOOLBAR_LIST_SELECTOR,
  TOOLBAR_SELECTOR,
  WRAP_CLASS,
} from "./selectors.ts";
import { createButton, scheduleColorSync, syncColor } from "./ui.ts";

/** Reçoit le bouton cliqué et la barre d'action qui le contient. */
type ClickHandler = (button: HTMLButtonElement, toolbar: HTMLElement) => void;

/** Référence faible : un composeur fermé par X ne reste pas en mémoire pour autant. */
let lastFocusedEditor: WeakRef<HTMLElement> | null = null;

let handler: ClickHandler | null = null;

/** Insère le bouton dans chaque barre d'action qui n'en a pas encore. */
export function scanToolbars(): void {
  if (!handler) return;
  for (const toolbar of document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTOR)) {
    if (!toolbar.querySelector(`.${BUTTON_CLASS}`)) injectButton(toolbar, handler);
  }
}

let scanScheduled = false;
function scheduleScan(): void {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scanToolbars();
  });
}

/**
 * Un ajout de nœuds peut faire apparaître une barre d'action : un seul balayage
 * par image, quelle que soit la taille du lot. Une mutation interne à une barre
 * (compteur de caractères à chaque frappe) ne demande qu'une resynchronisation
 * des couleurs. Les changements de notre propre bouton sont ignorés.
 */
function onMutations(records: MutationRecord[]): void {
  let colors = false;
  for (const record of records) {
    const target = record.target;
    if (target instanceof Element && target.closest(`.${WRAP_CLASS}`)) continue;
    if (record.addedNodes.length > 0) scheduleScan();
    if (!colors && target instanceof Element && target.closest(TOOLBAR_SELECTOR)) colors = true;
  }
  if (colors) scheduleColorSync();
}

function injectButton(toolbar: HTMLElement, onClick: ClickHandler): void {
  const host =
    toolbar.querySelector<HTMLElement>(TOOLBAR_LIST_SELECTOR) ??
    (toolbar.firstElementChild as HTMLElement | null) ??
    toolbar;

  const wrap = document.createElement("div");
  wrap.className = WRAP_CLASS;

  const button = createButton((clicked) => onClick(clicked, toolbar));

  wrap.appendChild(button);
  host.appendChild(wrap);
  syncColor(toolbar, button);
}

/** Retrouve l'éditeur associé à une barre d'action (ancêtre commun le plus proche). */
export function findEditor(toolbar: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = toolbar.parentElement;
  while (node && node !== document.body) {
    const editors = Array.from(node.querySelectorAll<HTMLElement>(EDITOR_SELECTOR));
    if (editors.length > 0) {
      const active = document.activeElement;
      return (
        editors.find((e) => e === active || e.contains(active)) ??
        editors.find((e) => e === lastFocusedEditor?.deref()) ??
        editors.at(-1) ??
        null
      );
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Retrouve le bouton xCorrect de l'éditeur (ancêtre commun le plus proche). Un
 * bouton n'est retenu que si sa barre d'action se rattache bien à cet éditeur :
 * le bouton d'un autre composeur de la page ne doit jamais être pris.
 */
export function findButton(editor: HTMLElement): HTMLButtonElement | null {
  for (let node = editor.parentElement; node && node !== document.body; node = node.parentElement) {
    for (const button of node.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`)) {
      const toolbar = button.closest<HTMLElement>(TOOLBAR_SELECTOR);
      if (toolbar && findEditor(toolbar) === editor) return button;
    }
  }
  return null;
}

/**
 * Balaye la page, puis suit ses mutations et le focus. X remonte et démonte ses
 * composeurs en permanence, d'où l'observateur plutôt qu'un balayage unique.
 */
export function watchToolbars(onClick: ClickHandler): void {
  handler = onClick;
  document.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement | null;
    const editor = target?.closest<HTMLElement>(EDITOR_SELECTOR);
    if (editor) lastFocusedEditor = new WeakRef(editor);
  });

  new MutationObserver(onMutations).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scanToolbars();
}
