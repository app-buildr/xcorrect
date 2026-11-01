// Points d'accroche dans le DOM de X. Regroupés ici parce que ce sont eux qui
// cassent lors d'une refonte de leur interface : un seul fichier à relire.

export const TOOLBAR_SELECTOR = '[data-testid="toolBar"]';
export const TOOLBAR_LIST_SELECTOR = '[data-testid="ScrollSnap-List"]';
export const EDITOR_SELECTOR = '[data-testid^="tweetTextarea_"][contenteditable="true"]';
export const BLOCK_SELECTOR = '[data-block="true"]';

/** Icônes natives dont on copie la couleur, par ordre de préférence. */
export const NATIVE_ICON_SELECTORS = [
  '[data-testid="gifSearchButton"] svg',
  '[data-testid="createPollButton"] svg',
  '[data-testid="scheduleOption"] svg',
  "[aria-label] svg",
];

export const BUTTON_CLASS = "xcorrect-btn";
export const WRAP_CLASS = "xcorrect-wrap";
