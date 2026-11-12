// Détection des barres d'action de X et insertion des boutons.
import {
  BUTTON_CLASS,
  EDITOR_SELECTOR,
  MIC_CLASS,
  TIP_CLASS,
  TOOLBAR_LIST_SELECTOR,
  TOOLBAR_SELECTOR,
  WRAP_CLASS,
} from "./selectors.ts";
import { createButton, createMicButton, scheduleColorSync, syncColor } from "./ui.ts";

/** Reçoit le bouton cliqué et la barre d'action qui le contient. */
type ClickHandler = (button: HTMLButtonElement, toolbar: HTMLElement) => void;

/** Référence faible : un composeur fermé par X ne reste pas en mémoire pour autant. */
let lastFocusedEditor: WeakRef<HTMLElement> | null = null;

let onCorrect: ClickHandler | null = null;
/** Reste nul tant que la dictée locale n'est pas confirmée : pas de micro. */
let onDictate: ClickHandler | null = null;

/** Équipe chaque barre d'action du bouton de correction et, si la dictée est active, du micro. */
export function scanToolbars(): void {
  if (!onCorrect) return;
  for (const toolbar of document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTOR)) {
    const wrap = toolbar.querySelector<HTMLElement>(`.${WRAP_CLASS}`) ?? injectWrap(toolbar, onCorrect);
    if (onDictate && !wrap.querySelector(`.${MIC_CLASS}`)) addMic(toolbar, wrap, onDictate);
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
 * des couleurs. Les changements de nos propres boutons et info-bulles sont
 * ignorés : la bulle de dictée change à chaque mot entendu.
 */
function onMutations(records: MutationRecord[]): void {
  let colors = false;
  for (const record of records) {
    const target = record.target;
    if (target instanceof Element && target.closest(`.${WRAP_CLASS}, .${TIP_CLASS}`)) continue;
    if (Array.from(record.addedNodes).some(isForeign)) scheduleScan();
    if (!colors && target instanceof Element && target.closest(TOOLBAR_SELECTOR)) colors = true;
  }
  if (colors) scheduleColorSync();
}

const isForeign = (node: Node): boolean => !(node instanceof Element && node.classList.contains(TIP_CLASS));

function injectWrap(toolbar: HTMLElement, correct: ClickHandler): HTMLElement {
  const host =
    toolbar.querySelector<HTMLElement>(TOOLBAR_LIST_SELECTOR) ??
    (toolbar.firstElementChild as HTMLElement | null) ??
    toolbar;

  const wrap = document.createElement("div");
  wrap.className = WRAP_CLASS;

  const button = createButton((clicked) => correct(clicked, toolbar));

  wrap.appendChild(button);
  host.appendChild(wrap);
  syncColor(toolbar, button);
  return wrap;
}

/** Le micro se place juste après le bouton de correction. */
function addMic(toolbar: HTMLElement, wrap: HTMLElement, dictate: ClickHandler): void {
  const mic = createMicButton((clicked) => dictate(clicked, toolbar));
  wrap.appendChild(mic);
  syncColor(toolbar, mic);
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
export function watchToolbars(correct: ClickHandler): void {
  onCorrect = correct;
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

/**
 * Ajoute le micro aux barres déjà équipées, puis à celles qui apparaîtront.
 * Appelé une fois la dictée locale confirmée, après watchToolbars.
 */
export function enableDictation(dictate: ClickHandler): void {
  onDictate = dictate;
  scanToolbars();
}
