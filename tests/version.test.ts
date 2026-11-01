import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewer, parseVersion } from "../src/shared/version.ts";

test("le tag d'une release donne la version, avec ou sans « v »", () => {
  assert.equal(parseVersion("v1.0.2"), "1.0.2");
  assert.equal(parseVersion("1.0.2"), "1.0.2");
  assert.equal(parseVersion(" v0.2.0 "), "0.2.0");
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion("v1.0"), null);
  assert.equal(parseVersion(42), null);
});

test("seule une version publiée plus récente est une mise à jour", () => {
  assert.equal(isNewer("0.2.0", "0.1.0"), true);
  assert.equal(isNewer("v0.1.1", "0.1.0"), true);
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.10.0", "0.9.0"), true); // comparaison numérique, pas alphabétique
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  // Version de développement en avance sur la release.
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
});

test("une version illisible ou absente ne signale rien", () => {
  assert.equal(isNewer(null, "0.1.0"), false);
  assert.equal(isNewer("bientôt", "0.1.0"), false);
  assert.equal(isNewer("0.2.0", "dev"), false);
});
