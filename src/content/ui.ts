// Présentation : les boutons, leurs états et les info-bulles.
import { BUTTON_CLASS, MIC_CLASS, NATIVE_ICON_SELECTORS, TIP_CLASS, TOOLBAR_SELECTOR } from "./selectors.ts";

/** « listening » n'est porté que par le micro, pendant la dictée. */
type ButtonState = "idle" | "loading" | "listening" | "done" | "error";
type TipKind = "info" | "error";

// Icônes filaires dans le style des pictogrammes de X : un « A » et une coche,
// puis un micro, plein pendant l'écoute.
const ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17.5 8.5 5.5l5 12M5.6 13h5.8"/><path d="M14.5 15.5l2.6 2.6L22.5 12"/></g></svg>`;
const MIC_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8.75" y="2.75" width="6.5" height="11.5" rx="3.25"/><path d="M5.25 11.25a6.75 6.75 0 0 0 13.5 0M12 18v3.25"/></g></svg>`;
const MIC_ON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8.75" y="2.75" width="6.5" height="11.5" rx="3.25" fill="currentColor"/><path d="M5.25 11.25a6.75 6.75 0 0 0 13.5 0M12 18v3.25"/></g></svg>`;
const SPINNER_SVG = `<svg class="xcorrect-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-dasharray="40 20" stroke-linecap="round"/></svg>`;

/** Icône de repos de chaque bouton, rétablie à la sortie des autres états. */
const idleIcons = new WeakMap<HTMLButtonElement, string>();

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
  for (const button of document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}, .${MIC_CLASS}`)) {
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

type ButtonSpec = { className: string; label: string; title: string; icon: string };

function makeButton(spec: ButtonSpec, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = spec.className;
  button.dataset.state = "idle";
  button.setAttribute("aria-label", spec.label);
  button.title = spec.title;
  button.innerHTML = spec.icon;
  idleIcons.set(button, spec.icon);

  // Garde le focus dans l'éditeur : indispensable pour retrouver la bonne zone
  // de texte et pour que Ctrl+Z annule la correction.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => onClick(button));
  return button;
}

/** Crée le bouton de correction, sans l'insérer : l'insertion appartient au module toolbar. */
export function createButton(onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  return makeButton(
    {
      className: BUTTON_CLASS,
      label: "Corriger l'orthographe avec xCorrect",
      title: "Corriger l'orthographe (xCorrect)",
      icon: ICON_SVG,
    },
    onClick,
  );
}

/** Crée le bouton de dictée, même contrat que createButton. */
export function createMicButton(onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = makeButton(
    {
      className: MIC_CLASS,
      label: "Dicter puis corriger avec xCorrect",
      title: "Dicter puis corriger (xCorrect)",
      icon: MIC_SVG,
    },
    onClick,
  );
  button.setAttribute("aria-pressed", "false");
  return button;
}

const resetTimers = new WeakMap<HTMLButtonElement, number>();

function iconFor(button: HTMLButtonElement, state: ButtonState): string {
  if (state === "loading") return SPINNER_SVG;
  if (state === "listening") return MIC_ON_SVG;
  return idleIcons.get(button) ?? ICON_SVG;
}

export function setState(button: HTMLButtonElement, state: ButtonState): void {
  button.dataset.state = state;
  if (state !== "idle") button.style.removeProperty("color");
  button.innerHTML = iconFor(button, state);
  button.disabled = state === "loading";
  if (button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", String(state === "listening"));
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

/**
 * Au-dessus de `anchor`. Un bouton retiré de la page (composeur fermé entre-temps)
 * n'a plus de position : la bulle va alors en bas de la fenêtre, pour rester lisible.
 */
function placeTip(tip: HTMLElement, anchor: HTMLElement): void {
  if (anchor.isConnected) {
    const rect = anchor.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
  } else {
    tip.style.left = `${window.innerWidth / 2}px`;
    tip.style.top = `${window.innerHeight - 24}px`;
  }
}

/** Ouvre une info-bulle au-dessus de `anchor`, en remplaçant celle déjà affichée. */
function openTip(anchor: HTMLElement, message: string, kind: TipKind): HTMLElement {
  currentTip?.remove();
  const tip = document.createElement("div");
  tip.className = TIP_CLASS;
  tip.dataset.kind = kind;
  tip.setAttribute("role", "status");
  tip.textContent = message;
  placeTip(tip, anchor);

  document.body.appendChild(tip);
  currentTip = tip;
  requestAnimationFrame(() => tip.classList.add("is-visible"));
  return tip;
}

function closeTip(tip: HTMLElement): void {
  tip.classList.remove("is-visible");
  window.setTimeout(() => tip.remove(), 200);
  if (currentTip === tip) currentTip = null;
}

export function showTip(anchor: HTMLElement, message: string, kind: TipKind): void {
  const tip = openTip(anchor, message, kind);
  window.setTimeout(() => closeTip(tip), kind === "error" ? 4000 : 2200);
}

/** Au-delà, seule la fin de la transcription est affichée : c'est elle qui bouge. */
const LIVE_MAX_CHARS = 140;

export type LiveTip = { update(text: string): void; close(): void };

/**
 * Info-bulle maintenue ouverte pendant la dictée et réécrite à chaque résultat.
 * Elle n'est pas annoncée aux lecteurs d'écran : ses mises à jour continues
 * couvriraient la voix de l'utilisateur. Les autres bulles ne la remplacent
 * pas : elles s'affichent par-dessus le temps de leur message, puis la laissent
 * reparaître, pour qu'on voie toujours que le micro écoute.
 */
export function openLiveTip(anchor: HTMLElement, placeholder: string): LiveTip {
  const tip = openTip(anchor, placeholder, "info");
  currentTip = null;
  tip.setAttribute("aria-live", "off");
  return {
    update(text) {
      tip.textContent = !text
        ? placeholder
        : text.length > LIVE_MAX_CHARS
          ? `…${text.slice(-LIVE_MAX_CHARS)}`
          : text;
      // La page a pu défiler depuis l'ouverture.
      placeTip(tip, anchor);
    },
    close: () => closeTip(tip),
  };
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

/**
 * Écriture manquée : le texte (correction ou dictée) est mis à l'abri dans le
 * presse-papiers, et le message dit ce qui s'est passé. `label` nomme ce texte,
 * « Texte corrigé » ou « Texte dicté ».
 */
export async function rescue(
  button: HTMLButtonElement,
  problem: string,
  text: string,
  label: string,
): Promise<void> {
  const copied = await navigator.clipboard.writeText(text).then(
    () => true,
    // presse-papiers indisponible (fenêtre sans focus, permission refusée)
    () => false,
  );
  finish(button, "error", copied ? `${problem}. ${label} copié dans le presse-papiers.` : `${problem}. Réessaie.`, "error");
}
