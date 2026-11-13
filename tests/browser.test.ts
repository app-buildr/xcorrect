import assert from "node:assert/strict";
import { test } from "node:test";
import { isBrave } from "../src/shared/browser.ts";

test("isBrave : reconnu à sa marque dans userAgentData", async () => {
  const brands = [{ brand: "Chromium" }, { brand: "Brave" }, { brand: "Not_A Brand" }];
  assert.equal(await isBrave({ userAgentData: { brands } }), true);
});

test("isBrave : reconnu à navigator.brave.isBrave()", async () => {
  assert.equal(await isBrave({ brave: { isBrave: async () => true } }), true);
});

test("isBrave : Chrome n'est pas Brave", async () => {
  const brands = [{ brand: "Chromium" }, { brand: "Google Chrome" }, { brand: "Not_A Brand" }];
  assert.equal(await isBrave({ userAgentData: { brands } }), false);
  assert.equal(await isBrave({}), false);
});

test("isBrave : une vérification qui échoue ne désigne pas Brave", async () => {
  assert.equal(await isBrave({ brave: { isBrave: async () => Promise.reject(new Error("x")) } }), false);
  assert.equal(await isBrave({ brave: {} }), false);
});
