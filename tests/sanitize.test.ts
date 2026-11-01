import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeCorrection, readCorrection, stripAddedQuotes, stripTags, type ModelReply } from "../src/background/sanitize.ts";

test("stripTags retire les balises recopiées par le modèle", () => {
  assert.equal(stripTags("<tweet>\nBonjour\n</tweet>"), "Bonjour");
  assert.equal(stripTags("Bonjour"), "Bonjour");
  // Une balise au milieu du texte appartient à l'utilisateur.
  assert.equal(stripTags("a <tweet> b"), "a <tweet> b");
});

test("stripAddedQuotes retire les guillemets ajoutés par le modèle", () => {
  assert.equal(stripAddedQuotes('"Bonjour"', "Bonjour"), "Bonjour");
  assert.equal(stripAddedQuotes("«Bonjour»", "Bonjour"), "Bonjour");
  assert.equal(stripAddedQuotes("“Bonjour”", "Bonjour"), "Bonjour");
});

test("stripAddedQuotes conserve les guillemets qui appartiennent à l'utilisateur", () => {
  assert.equal(stripAddedQuotes('"Bonjour"', '"Bonjour"'), '"Bonjour"');
  assert.equal(stripAddedQuotes("«Bonjour»", "«Bonjour»"), "«Bonjour»");
});

test("stripAddedQuotes laisse intacts les guillemets internes", () => {
  // Citation en milieu de tweet.
  const tweet = "Il a relu le livre appelé « Le Petit Prince » hier soir...";
  assert.equal(stripAddedQuotes(tweet, tweet), tweet);
});

test("looksLikeCorrection accepte une correction de longueur voisine", () => {
  const original = "Si tu pouvais garder ton delire pour toi stp..";
  const corrige = "Si tu pouvais garder ton délire pour toi stp..";
  assert.equal(looksLikeCorrection(corrige, original), true);
  assert.equal(looksLikeCorrection(original, original), true);
});

test("looksLikeCorrection rejette une réponse qui n'en est pas une", () => {
  const original = "Le musée ferme ses portes à dix-huit heures";
  assert.equal(looksLikeCorrection("Oui.", original), false);
  assert.equal(looksLikeCorrection(original.repeat(4), original), false);
});

test("looksLikeCorrection tolère un écart absolu sur un texte très court", () => {
  // La marge de 40 caractères évite de rejeter l'ajout d'un accent sur 3 mots.
  assert.equal(looksLikeCorrection("Ça va ?", "Ca va"), true);
});

test("stripAddedQuotes garde les guillemets du brouillon même si le modèle en change le style", () => {
  assert.equal(stripAddedQuotes("« Je suis là »", '"Je suis la"'), "« Je suis là »");
  assert.equal(stripAddedQuotes('"Bonjour"', "“Bonjour”"), '"Bonjour"');
  // Deux citations : les guillemets extérieurs ne forment pas une paire, mais
  // appartiennent bien au brouillon.
  assert.equal(stripAddedQuotes("« Il » a dit « oui »", '"Il" a dit "oui"'), "« Il » a dit « oui »");
});

const reply = (text: string): ModelReply => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

test("readCorrection rend des guillemets du brouillon, même restylés par le modèle", () => {
  assert.equal(readCorrection(reply("« Je suis là »"), '"Je suis la"'), '"Je suis là"');
});

test("readCorrection retire les insécables que l'éditeur ne conserverait pas", () => {
  // L'éditeur les rendrait en espaces : la relecture après collage échouerait.
  assert.equal(readCorrection(reply("J'ai couru 10 kilomètres"), "J'ai couru 10 kilometre"), "J'ai couru 10 kilomètres");
  // Celles qui précèdent un signe double restent.
  assert.equal(readCorrection(reply("Vraiment ?"), "Vraiment ?"), "Vraiment ?");
});

test("readCorrection conserve les sauts de ligne de tête du brouillon", () => {
  assert.equal(readCorrection(reply("Texte avec une faute"), "\n\nTexte avec une faut"), "\n\nTexte avec une faute");
});
