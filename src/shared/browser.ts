// Détection du navigateur, pour écarter les fonctions qu'il ne sait pas assurer.

/** Ce que Brave expose sur navigator : la lib DOM de TypeScript n'en déclare rien. */
export type BrowserNavigator = {
  brave?: { isBrave?: () => Promise<boolean> | boolean };
  userAgentData?: { brands?: ReadonlyArray<{ brand: string }> };
};

/**
 * Vrai sous Brave. Son user agent est celui de Chrome : on le reconnaît à sa
 * marque dans userAgentData, ou à navigator.brave.isBrave().
 */
export async function isBrave(
  nav: BrowserNavigator = globalThis.navigator as unknown as BrowserNavigator,
): Promise<boolean> {
  if (!nav) return false;
  if (nav.userAgentData?.brands?.some(({ brand }) => brand === "Brave")) return true;
  const check = nav.brave?.isBrave;
  if (typeof check !== "function") return false;
  try {
    return (await check.call(nav.brave)) === true;
  } catch {
    return false;
  }
}
