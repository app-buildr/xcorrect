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

/** Bouton de correction : sa présence signale une barre d'action déjà équipée. */
export const BUTTON_CLASS = "xcorrect-btn";
/** Bouton de dictée, voisin du bouton de correction dans le même conteneur. */
export const MIC_CLASS = "xcorrect-mic";
export const WRAP_CLASS = "xcorrect-wrap";
/** Info-bulles, ajoutées au body : leurs mutations ne concernent pas X. */
export const TIP_CLASS = "xcorrect-tip";
