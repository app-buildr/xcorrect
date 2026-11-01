// Présentation : le bouton, ses états et les info-bulles.
import { BUTTON_CLASS, NATIVE_ICON_SELECTORS, TOOLBAR_SELECTOR } from "./selectors.ts";

type ButtonState = "idle" | "loading" | "done" | "error";
type TipKind = "info" | "error";

// Icône filaire dans le style des pictogrammes de X : un « A » et une coche
const ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17.5 8.5 5.5l5 12M5.6 13h5.8"/><path d="M14.5 15.5l2.6 2.6L22.5 12"/></g></svg>`;
const SPINNER_SVG = `<svg class="xcorrect-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-dasharray="40 20" stroke-linecap="round"/></svg>`;

/** Reprend la couleur courante des icônes natives (bleu actif, gris inactif, thème sombre). */
export function syncColor(toolbar: HTMLElement, button: HTMLButtonElement): void {
  if (button.dataset.state !== "idle") return;
  let nativeIcon: SVGElement | null = null;
  for (const selector of NATIVE_ICON_SELECTORS) {
    nativeIcon = toolbar.querySelector<SVGElement>(selector);
    if (nativeIcon) break;
  }
  if (!nativeIcon) return;
  const color = getComputedStyle(nativeIcon).color;
  if (color && button.style.color !== color) button.style.color = color;
}

/** Même chose, en retrouvant la barre d'action depuis le bouton. */
function syncButtonColor(button: HTMLButtonElement): void {
  const toolbar = button.closest<HTMLElement>(TOOLBAR_SELECTOR);
  if (toolbar) syncColor(toolbar, button);
}

function syncAllColors(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`)) {
    syncButtonColor(button);
  }
}

let colorTimer = 0;

/**
 * Seul chemin de synchronisation des couleurs, hors insertion d'un bouton. X
 * restyle ses icônes après coup : une seule passe, 80 ms après le dernier
 * événement, plutôt qu'une par frappe.
 */
export function scheduleColorSync(): void {
  window.clearTimeout(colorTimer);
  colorTimer = window.setTimeout(syncAllColors, 80);
}

/** Crée le bouton, sans l'insérer : l'insertion appartient au module toolbar. */
export function createButton(onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.dataset.state = "idle";
  button.setAttribute("aria-label", "Corriger l'orthographe avec xCorrect");
  button.title = "Corriger l'orthographe (xCorrect)";
  button.innerHTML = ICON_SVG;

  // Garde le focus dans l'éditeur : indispensable pour retrouver la bonne zone
  // de texte et pour que Ctrl+Z annule la correction.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => onClick(button));
  return button;
}

const resetTimers = new WeakMap<HTMLButtonElement, number>();

export function setState(button: HTMLButtonElement, state: ButtonState): void {
  button.dataset.state = state;
  if (state !== "idle") button.style.removeProperty("color");
  button.innerHTML = state === "loading" ? SPINNER_SVG : ICON_SVG;
  button.disabled = state === "loading";
  window.clearTimeout(resetTimers.get(button));
  resetTimers.delete(button);
  if (state === "done" || state === "error") {
    const timer = window.setTimeout(() => {
      if (button.dataset.state === state) setState(button, "idle");
    }, 2500);
    resetTimers.set(button, timer);
  }
  if (state === "idle") syncButtonColor(button);
}

let currentTip: HTMLElement | null = null;

export function showTip(anchor: HTMLElement, message: string, kind: TipKind): void {
  currentTip?.remove();
  const tip = document.createElement("div");
  tip.className = "xcorrect-tip";
  tip.dataset.kind = kind;
  tip.setAttribute("role", "status");
  tip.textContent = message;

  const rect = anchor.getBoundingClientRect();
  tip.style.left = `${rect.left + rect.width / 2}px`;
  tip.style.top = `${rect.top - 8}px`;

  document.body.appendChild(tip);
  currentTip = tip;
  requestAnimationFrame(() => tip.classList.add("is-visible"));
  window.setTimeout(
    () => {
      tip.classList.remove("is-visible");
      window.setTimeout(() => tip.remove(), 200);
    },
    kind === "error" ? 4000 : 2200,
  );
}

/** Chaque issue du clic se solde par un état de bouton et une info-bulle. */
export function finish(
  button: HTMLButtonElement,
  state: ButtonState,
  message: string,
  kind: TipKind,
): void {
  setState(button, state);
  showTip(button, message, kind);
}
