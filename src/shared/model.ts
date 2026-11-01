// Profil du modèle de correction. Source unique : le service worker l'appelle,
// l'eval le mesure, le build en reporte le nom dans la description du manifest.

// Identifiant figé (snapshot sans date) : le comportement ne bouge pas
// silencieusement à la prochaine release.
export const MODEL = "claude-haiku-5-5";

/** Nom affiché à l'utilisateur. */
export const MODEL_NAME = "Claude Haiku 5.5";

/** « low » suffit pour corriger un tweet et garde la latence basse (cf. eval/run.ts). */
export const EFFORT = "low";

/** Densité du français pour ce tokenizer (≈ 3,5 caractères/token sur l'ancien, ~30 % de tokens en plus ici). */
export const CHARS_PER_TOKEN = 2.7;

/**
 * Part de max_tokens réservée à la réflexion, qui y est décomptée. Environ 100
 * tokens mesurés en effort « low » ; seuls les tokens produits sont facturés.
 */
export const THINKING_RESERVE_TOKENS = 1_000;
