// Alignement mot à mot entre le brouillon et sa correction. Fonctions pures,
// sans DOM ni Chrome : le service worker s'en sert pour rétablir la mise en
// forme d'origine, le content script pour souligner les mots corrigés.

/** Texte découpé en mots et ponctuation, avec les espaces qui les séparent. */
type Split = {
  /** Mots et signes, sans espace. */
  tokens: string[];
  /** gaps[k] précède tokens[k] ; gaps[tokens.length] termine le texte. */
  gaps: string[];
};

// Lettres et chiffres forment un mot ; tout autre caractère (ponctuation,
// émoji) est un signe isolé. \s couvre aussi les espaces insécables.
const TOKEN = /(\s*)([\p{L}\p{M}\p{N}]+|[^\s])/gu;

function split(text: string): Split {
  const tokens: string[] = [];
  const gaps: string[] = [];
  let end = 0;
  for (const match of text.matchAll(TOKEN)) {
    gaps.push(match[1]!);
    tokens.push(match[2]!);
    end = match.index + match[0].length;
  }
  gaps.push(text.slice(end));
  return { tokens, gaps };
}

// Variantes que le modèle substitue sans que ce soit une correction : le
// brouillon garde les siennes (guillemets droits, apostrophe courbe…). Chaque
// variante est ramenée à un représentant, une seule fois par signe.
const CANONICAL: ReadonlyMap<string, string> = new Map([
  ...['"', "«", "»", "“", "”"].map((q) => [q, '"'] as const),
  ...["'", "’"].map((q) => [q, "'"] as const),
]);

const canonical = (sign: string): string => CANONICAL.get(sign) ?? sign;

/** Deux signes équivalents : identiques, ou deux variantes du même guillemet ou de l'apostrophe. */
export const sameSign = (a: string, b: string): boolean => canonical(a) === canonical(b);

/**
 * Au-delà de ce nombre de modifications, la réponse est une réécriture plutôt
 * qu'une correction : on renonce à rétablir la forme. La mémoire de
 * l'alignement croît comme le carré de ce nombre, pas avec la longueur du texte.
 */
const MAX_EDITS = 1_000;

/**
 * Pour chaque signe de `b`, l'indice du signe équivalent de `a` auquel il est
 * aligné (plus longue sous-séquence commune), ou -1 s'il est nouveau.
 *
 * Algorithme de Myers : O((n + m) · d) en temps pour d modifications. Une
 * correction ne change que quelques mots, d reste petit même sur un post long.
 */
function align(tokensA: string[], tokensB: string[]): Int32Array | null {
  const a = tokensA.map(canonical);
  const b = tokensB.map(canonical);
  const match = new Int32Array(b.length).fill(-1);

  // Début et fin communs : alignés d'office, hors de la recherche.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    match[start] = start;
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    match[endB] = endA;
  }

  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0) return match;

  // v[k + offset] : abscisse la plus avancée sur la diagonale k = x - y.
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  // trace[d] : copie de v sur les diagonales -d..d après d modifications.
  const trace: Int32Array[] = [];
  const maxD = Math.min(n + m, MAX_EDITS);

  for (let d = 0; d <= maxD; d++) {
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
      let x = down ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        backtrack(trace, n, m, (i, j) => (match[start + j] = start + i));
        return match;
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

/** Remonte le chemin de Myers et signale chaque paire de signes alignés. */
function backtrack(trace: Int32Array[], n: number, m: number, pair: (i: number, j: number) => void): void {
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1]!; // diagonales -(d-1)..(d-1), indice k + d - 1
    const at = (k: number) => prev[k + d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    // Le serpent suit la modification : de son arrivée jusqu'à (x, y).
    const snakeX = down ? prevX : prevX + 1;
    while (x > snakeX) {
      x--;
      y--;
      pair(x, y);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    pair(x, y);
  }
}

/**
 * Correction dont les espaces, sauts de ligne, guillemets et apostrophes sont
 * ceux du brouillon partout où le modèle n'a pas changé les mots voisins, ou
 * n'a fait que remplacer un mot par un autre (`la` → `là`) : l'espace qui borde
 * une substitution reste celui du brouillon. Les espaces qui entourent un mot
 * ajouté (`ne`) ou fusionné (`auto routes` → `autoroutes`) restent ceux du modèle.
 */
export function keepOriginalLayout(original: string, corrected: string): string {
  const a = split(original);
  const b = split(corrected);
  const match = align(a.tokens, b.tokens);
  if (!match || b.tokens.length === 0) return corrected;

  const n = a.tokens.length;
  const kept = new Uint8Array(n + 1); // signes du brouillon conservés ; kept[n] borne la fin
  for (const i of match) if (i >= 0) kept[i] = 1;
  kept[n] = 1;
  /** Le signe du brouillon d'indice `i` existe et a été remplacé par le modèle. */
  const replaced = (i: number) => i >= 0 && i < n && !kept[i];

  const last = b.tokens.length - 1;
  // Espace de tête : celui du brouillon si son premier signe est conservé, ou
  // remplacé par le premier signe de la correction.
  let out = match[0] === 0 || (match[0]! < 0 && replaced(0)) ? a.gaps[0]! : b.gaps[0]!;
  for (let j = 0; j <= last; j++) {
    const i = match[j]!;
    out += i >= 0 ? a.tokens[i]! : b.tokens[j]!;
    if (j < last) {
      const next = match[j + 1]!;
      if (i >= 0 && next === i + 1) out += a.gaps[i + 1]!;
      // Signe nouveau suivi d'un signe conservé, qui suit lui-même un signe remplacé.
      else if (i < 0 && next >= 0 && replaced(next - 1)) out += a.gaps[next]!;
      // Signe conservé suivi d'un signe nouveau, à la place du suivant du brouillon.
      else if (i >= 0 && next < 0 && replaced(i + 1)) out += a.gaps[i + 1]!;
      else out += b.gaps[j + 1]!;
    } else {
      out += i === n - 1 || (i < 0 && replaced(n - 1)) ? a.gaps[n]! : b.gaps[last + 1]!;
    }
  }
  return out;
}

/** Signes de la correction, dans l'ordre, marqués s'ils sont nouveaux ou modifiés. */
export function correctedTokens(original: string, corrected: string): Array<{ text: string; changed: boolean }> {
  const b = split(corrected).tokens;
  const match = align(split(original).tokens, b);
  return b.map((text, j) => ({ text, changed: match ? match[j]! < 0 : false }));
}
