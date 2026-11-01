import assert from "node:assert/strict";
import { test } from "node:test";
import { correctedTokens, keepOriginalLayout } from "../src/shared/diff.ts";

test("les guillemets droits du brouillon remplacent les « » du modèle", () => {
  assert.equal(
    keepOriginalLayout('un film "culte" et', "un film « culte » et"),
    'un film "culte" et',
  );
});

test("l'apostrophe courbe du brouillon est conservée", () => {
  assert.equal(keepOriginalLayout("C’est pas", "C'est pas"), "C’est pas");
});

test("doubles espaces, insécables et sauts de ligne du brouillon sont rétablis", () => {
  assert.equal(keepOriginalLayout("Cohincidence ?  Je", "Coïncidence ? Je"), "Coïncidence ?  Je");
  assert.equal(keepOriginalLayout("«\u00a0la météo\u00a0»", "« la météo »"), "«\u00a0la météo\u00a0»");
  assert.equal(keepOriginalLayout("viendra ? \n\nNOUS", "viendra ?\n\nNOUS"), "viendra ? \n\nNOUS");
});

test("une espace ajoutée devant les deux-points est retirée", () => {
  assert.equal(keepOriginalLayout("réponse: OUI", "réponse : OUI"), "réponse: OUI");
});

test("les espaces autour d'un mot ajouté ou fusionné viennent du modèle", () => {
  assert.equal(keepOriginalLayout("Personne peut venir", "Personne ne peut venir"), "Personne ne peut venir");
  assert.equal(keepOriginalLayout("Sont ils prêts", "Sont-ils prêts"), "Sont-ils prêts");
  assert.equal(keepOriginalLayout("les auto routes", "les autoroutes"), "les autoroutes");
});

test("l'espace qui borde un mot remplacé reste celui du brouillon", () => {
  assert.equal(keepOriginalLayout('"Je suis la"', "« Je suis là »"), '"Je suis là"');
  assert.equal(keepOriginalLayout("10 kilometre", "10\u00A0kilomètres"), "10 kilomètres");
  assert.equal(keepOriginalLayout("\n\nla faute", "\nLa faute"), "\n\nLa faute");
  assert.equal(keepOriginalLayout("une faut\n\n", "une faute"), "une faute\n\n");
});

test("les corrections de mots passent telles quelles", () => {
  assert.equal(keepOriginalLayout("tes photos souvenir", "tes photos souvenirs"), "tes photos souvenirs");
  assert.equal(keepOriginalLayout("ou est le probleme", "où est le problème"), "où est le problème");
});

test("un émoji et une URL restent en place", () => {
  assert.equal(
    keepOriginalLayout("trop  bien 😂 https://x.com/a", "trop bien 😂 https://x.com/a"),
    "trop  bien 😂 https://x.com/a",
  );
});

test("les signes nouveaux ou modifiés sont repérés pour le soulignement", () => {
  const changed = correctedTokens("ou est le probleme ?", "où est le problème ?")
    .filter((t) => t.changed)
    .map((t) => t.text);
  assert.deepEqual(changed, ["où", "problème"]);
  assert.deepEqual(correctedTokens('"culte"', "« culte »").filter((t) => t.changed), []);
});

test("un post Premium de plusieurs milliers de mots garde sa mise en forme", () => {
  const words = Array.from({ length: 2_500 }, (_, i) => `mot${i}`);
  const original = words.join("  ").replace("mot1200", "probleme");
  const corrected = words.join(" ").replace("mot1200", "problème");
  // Substitution d'un mot : les doubles espaces qui le bordent sont aussi conservés.
  assert.equal(keepOriginalLayout(original, corrected), original.replace("probleme", "problème"));
  const changed = correctedTokens(original, corrected).filter((t) => t.changed).map((t) => t.text);
  assert.deepEqual(changed, ["problème"]);
});

/** Longueur de la plus longue sous-séquence commune, par programmation dynamique. */
function lcsLength(a: string[], b: string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const next = new Array<number>(b.length + 1).fill(0);
    for (let j = b.length - 1; j >= 0; j--) {
      next[j] = a[i] === b[j] ? row[j + 1]! + 1 : Math.max(row[j]!, next[j + 1]!);
    }
    row = next;
  }
  return row[0]!;
}

test("l'alignement est une plus longue sous-séquence commune, sur des textes aléatoires", () => {
  let seed = 42;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  const vocab = ["a", "b", "c", "d", "e"];
  for (let run = 0; run < 500; run++) {
    const a = Array.from({ length: Math.floor(random() * 12) }, () => vocab[Math.floor(random() * 5)]!);
    const b = Array.from({ length: Math.floor(random() * 12) }, () => vocab[Math.floor(random() * 5)]!);
    const kept = correctedTokens(a.join(" "), b.join(" ")).filter((t) => !t.changed).length;
    assert.equal(kept, lcsLength(a, b), `${a.join("")} / ${b.join("")}`);
    // Les signes alignés recomposent la même séquence que le brouillon dans l'ordre.
    assert.equal(keepOriginalLayout(a.join(" "), b.join(" ")).split(" ").length, b.length || 1);
  }
});
