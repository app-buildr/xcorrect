import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSpaces, dictationSuffix, joinTranscript, normalize } from "../src/shared/text.ts";

const NBSP = " ";

test("cleanSpaces ramène les insécables parasites à des espaces normales", () => {
  assert.equal(cleanSpaces(`mot${NBSP}mot`), "mot mot");
  assert.equal(cleanSpaces(`fin de ligne${NBSP}`), "fin de ligne ");
});

test("cleanSpaces conserve les insécables typographiques du français", () => {
  // Avant un signe double, et après un guillemet ouvrant.
  assert.equal(cleanSpaces(`Vous avez fumé${NBSP}?`), `Vous avez fumé${NBSP}?`);
  assert.equal(cleanSpaces(`Exemple${NBSP}: ceci`), `Exemple${NBSP}: ceci`);
  assert.equal(cleanSpaces(`«${NBSP}citation${NBSP}»`), `«${NBSP}citation${NBSP}»`);
});

test("normalize fusionne les espaces sans toucher aux sauts de ligne", () => {
  assert.equal(normalize("a    b"), "a b");
  assert.equal(normalize("  a  \n  b  "), "a\nb");
  assert.equal(normalize("a\n\nb"), "a\n\nb");
});

test("normalize rogne les sauts de ligne aux extrémités seulement", () => {
  assert.equal(normalize("\n\na\n\n"), "a");
});

test("normalize préserve la ponctuation expressive", () => {
  // Quatre tweets sur dix se terminent ainsi : la comparaison ne doit pas
  // considérer une transformation en points de suspension comme identique.
  assert.notEqual(normalize("à demain stp.."), normalize("à demain stp…"));
});

test("normalize conserve les insécables, pour détecter une correction typographique", () => {
  assert.notEqual(normalize("fumé ?"), normalize(`fumé${NBSP}?`));
});

test("joinTranscript joint les segments de dictée par une seule espace", () => {
  assert.equal(joinTranscript(["bonjour à tous", " ceci est un test"]), "bonjour à tous ceci est un test");
  assert.equal(joinTranscript(["  un ", "", "   ", "deux"]), "un deux");
  assert.equal(joinTranscript([]), "");
});

test("dictationSuffix : brouillon vide, le texte dicté seul", () => {
  assert.equal(dictationSuffix("", "  bonjour "), "bonjour");
});

test("dictationSuffix : une espace devant, sauf si le brouillon finit par un blanc", () => {
  assert.equal(dictationSuffix("Salut.", "ça va"), " ça va");
  assert.equal(dictationSuffix("Salut. ", "ça va"), "ça va");
});

test("dictationSuffix : un saut de ligne tapé avant la dictée est respecté", () => {
  // Un bloc vide en fin de brouillon se lit comme un \n final : la dictée
  // commence la nouvelle ligne, sans espace parasite.
  assert.equal(dictationSuffix("Ligne 1\n", "ligne 2"), "ligne 2");
  assert.equal(dictationSuffix("Ligne 1\n\n", "ligne 3"), "ligne 3");
});

test("dictationSuffix : rien à coller si rien n'a été dicté", () => {
  assert.equal(dictationSuffix("Brouillon", "   "), "");
});
