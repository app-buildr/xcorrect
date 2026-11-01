// Règles métier partagées par le service worker et le content script. Aucun
// accès à Chrome ni au DOM : ce module est importable partout et testable.

import { CHARS_PER_TOKEN, THINKING_RESERVE_TOKENS } from "./model.ts";

export type AccountType = "free" | "premium";

/**
 * Plafond de longueur brute du brouillon, par type de compte.
 *
 * Volontairement plus large que la limite affichée par X, car celle-ci est
 * pondérée : une URL compte pour 23 caractères quelle que soit sa longueur
 * réelle, un emoji pour 2. Un post valide de 280 pondérés peut donc peser
 * plusieurs centaines de caractères bruts s'il enchaîne les liens. Ce plafond
 * ne reproduit pas la règle de X, il borne ce qu'on accepte d'envoyer à l'API.
 */
export const MAX_INPUT_CHARS: Record<AccountType, number> = {
  free: 1_000, // 280 pondérés, avec la marge nécessaire pour plusieurs URLs
  premium: 25_000, // limite des posts longs
};

/** Une valeur inconnue (stockage ancien ou corrompu, menu modifié) retombe sur le compte gratuit. */
export function toAccountType(value: unknown): AccountType {
  return typeof value === "string" && Object.hasOwn(MAX_INPUT_CHARS, value) ? (value as AccountType) : "free";
}

/** La sortie fait ~la taille de l'entrée : marge x1,5, plus la réserve de réflexion. */
export const maxTokensFor = (text: string): number =>
  Math.ceil((text.length / CHARS_PER_TOKEN) * 1.5) + THINKING_RESERVE_TOKENS;

/**
 * Budget d'une correction : 8 s de base + ~10 ms/caractère. La base couvre la
 * latence fixe (TLS, routage, premier token), la pente couvre la génération.
 * 280 caractères → ~10,8 s, 25 000 → ~4 min 18.
 */
export const requestBudgetMsFor = (text: string): number => 8_000 + text.length * 10;

/**
 * Filet de sécurité du content script. Il ne double pas le budget du worker :
 * celui-ci répond toujours, y compris en cas de dépassement. Ce délai ne sert
 * qu'au cas où le worker disparaît sans répondre du tout, d'où la marge.
 */
export const pageTimeoutMsFor = (text: string): number => requestBudgetMsFor(text) + 15_000;
