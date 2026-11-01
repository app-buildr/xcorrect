import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_INPUT_CHARS, maxTokensFor, pageTimeoutMsFor, requestBudgetMsFor } from "../src/shared/config.ts";

test("les plafonds couvrent les deux types de compte", () => {
  assert.equal(MAX_INPUT_CHARS.free, 1_000);
  assert.equal(MAX_INPUT_CHARS.premium, 25_000);
});

test("maxTokensFor laisse de quoi recopier tout le texte", () => {
  // La sortie fait environ la taille de l'entrée : la marge doit être positive.
  for (const longueur of [56, 126, 280, 1_000, 25_000]) {
    const texte = "x".repeat(longueur);
    assert.ok(maxTokensFor(texte) > longueur / 3.5, `marge insuffisante à ${longueur}`);
  }
});

test("requestBudgetMsFor couvre la latence fixe sur un texte court", () => {
  // Un tweet de 280 caractères doit disposer de bien plus que le temps de
  // génération seul : TLS, routage et premier token comptent.
  assert.ok(requestBudgetMsFor("x".repeat(280)) >= 10_000);
  assert.ok(requestBudgetMsFor("") >= 8_000);
});

test("le filet de la page reste au-dessus du budget du worker", () => {
  // C'est l'invariant qui évite que la page abandonne une correction en cours.
  for (const longueur of [0, 280, 1_000, 25_000]) {
    const texte = "x".repeat(longueur);
    assert.ok(
      pageTimeoutMsFor(texte) > requestBudgetMsFor(texte),
      `la page abandonnerait trop tôt à ${longueur} caractères`,
    );
  }
});
