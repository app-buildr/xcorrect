import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { describeError } from "../src/background/errors.ts";

/** Construit une erreur du SDK à partir d'un statut et d'un corps Anthropic. */
const apiError = (status: number, type: string, message: string) =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message }, request_id: null },
    message,
    new Headers(),
  );

test("chaque classe d'erreur du SDK a son message dédié", () => {
  assert.equal(describeError(apiError(401, "authentication_error", "x")), "Clé API invalide.");
  assert.equal(describeError(apiError(403, "permission_error", "x")), "Accès refusé pour cette clé API.");
  assert.equal(
    describeError(apiError(429, "rate_limit_error", "x")),
    "Limite de requêtes atteinte, réessaie dans un instant.",
  );
});

test("le message du corps de l'API est repris quand il éclaire la cause", () => {
  const err = apiError(400, "invalid_request_error", "temperature: unsupported");
  assert.equal(describeError(err), "Requête refusée : temperature: unsupported");
});

test("un modèle introuvable cite la réponse de l'API", () => {
  const err = apiError(404, "not_found_error", "model: claude-inexistant");
  assert.match(describeError(err), /^Modèle indisponible pour cette clé : model: claude-inexistant$/);
});

test("la surcharge du service est distinguée d'une erreur générique", () => {
  assert.equal(
    describeError(apiError(529, "overloaded_error", "overloaded")),
    "Service Anthropic surchargé, réessaie dans un instant.",
  );
  // Un 5xx qui n'est pas une surcharge retombe sur le message générique chiffré.
  assert.match(describeError(apiError(500, "api_error", "boom")), /^Erreur API \(500\) : boom$/);
});

test("les pannes réseau sont distinguées du dépassement de délai", () => {
  assert.equal(describeError(new Anthropic.APIConnectionTimeoutError({})), "Délai dépassé, réessaie.");
  assert.equal(
    describeError(new Anthropic.APIConnectionError({ message: "socket" })),
    "Impossible de joindre l'API Anthropic.",
  );
});

test("l'ordre des branches place les sous-classes avant APIError", () => {
  // Régression : APIError étant la classe mère, une branche mal placée
  // renverrait le message générique pour toutes les erreurs typées.
  for (const err of [
    apiError(401, "authentication_error", "x"),
    apiError(403, "permission_error", "x"),
    apiError(429, "rate_limit_error", "x"),
  ]) {
    assert.doesNotMatch(describeError(err), /^Erreur API/);
  }
});

test("une erreur hors SDK garde son message, et un non-Error est converti", () => {
  assert.equal(describeError(new Error("brouillon inchangé")), "brouillon inchangé");
  assert.equal(describeError("panne"), "panne");
  assert.equal(describeError(undefined), "undefined");
});
