// Détection des mises à jour. xCorrect est chargé en mode développeur, sans
// mise à jour automatique : la dernière release publiée sur GitHub est relevée
// régulièrement pour signaler qu'il faut mettre à jour. Fonctions pures,
// testées dans tests/version.test.ts.

/** Dernière release publiée de l'extension. */
export const RELEASES_URL = "https://api.github.com/repos/app-buildr/xcorrect/releases/latest";

/** Guide de mise à jour du README, lien du bandeau des options. */
export const UPDATE_GUIDE_URL = "https://github.com/app-buildr/xcorrect#mise-%C3%A0-jour";

/** Intervalle entre deux vérifications, en plus du démarrage et de l'ouverture des options. */
export const UPDATE_CHECK_MINUTES = 6 * 60;

/** `v1.2.3` ou `1.2.3` → `1.2.3`, ou null pour autre chose. */
export function parseVersion(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  return /^v?(\d+\.\d+\.\d+)$/.exec(tag.trim())?.[1] ?? null;
}

/**
 * La version publiée `latest` est plus récente que la version installée
 * `current`. Une version installée en avance (en développement) ne
 * déclenche rien, une version illisible non plus.
 */
export function isNewer(latest: string | null, current: string): boolean {
  const a = parseVersion(latest)?.split(".").map(Number);
  const b = parseVersion(current)?.split(".").map(Number);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
