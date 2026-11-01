import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { MAX_INPUT_CHARS } from "../src/shared/config.ts";
import { getSettings, setAccountType, setApiKey } from "../src/shared/storage.ts";

const getApiKey = async () => (await getSettings()).apiKey;
const getAccountType = async () => (await getSettings()).accountType;
const getMaxInputChars = async () => (await getSettings()).maxInputChars;

/**
 * Faux chrome.storage.local. Le vrai `get` prend un objet de valeurs par défaut
 * et ne renvoie la valeur stockée que si la clé existe : le stub reproduit ce
 * contrat, c'est lui que le code sous test exerce.
 */
let store: Record<string, unknown>;

function installChrome(): void {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (defaults: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(defaults).map(([k, v]) => [k, k in store ? store[k] : v]),
          ),
        set: async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        },
      },
    },
  };
}

beforeEach(installChrome);

test("une installation neuve n'a pas de clé et est réputée compte gratuit", async () => {
  assert.equal(await getApiKey(), "");
  assert.equal(await getAccountType(), "free");
  assert.equal(await getMaxInputChars(), MAX_INPUT_CHARS.free);
});

test("la clé API fait l'aller-retour sans altération", async () => {
  await setApiKey("sk-ant-exemple");
  assert.equal(await getApiKey(), "sk-ant-exemple");
});

test("le plafond suit le type de compte enregistré", async () => {
  await setAccountType("premium");
  assert.equal(await getAccountType(), "premium");
  assert.equal(await getMaxInputChars(), MAX_INPUT_CHARS.premium);

  await setAccountType("free");
  assert.equal(await getMaxInputChars(), MAX_INPUT_CHARS.free);
});

test("un type de compte inconnu en stockage retombe sur le compte gratuit", async () => {
  // Cas réel : valeur écrite par une version antérieure, ou stockage corrompu.
  // Sans repli, MAX_INPUT_CHARS[valeur] vaudrait undefined et le plafond
  // laisserait passer n'importe quelle longueur.
  store.accountType = "entreprise";
  assert.equal(await getAccountType(), "free");
  assert.equal(await getMaxInputChars(), MAX_INPUT_CHARS.free);
});

test("une clé héritée du prototype n'est pas un type de compte", async () => {
  store.accountType = "toString";
  assert.equal(await getAccountType(), "free");
  assert.equal(await getMaxInputChars(), MAX_INPUT_CHARS.free);
});

test("écrire le type de compte ne touche pas à la clé API", async () => {
  await setApiKey("sk-ant-exemple");
  await setAccountType("premium");
  assert.equal(await getApiKey(), "sk-ant-exemple");
});
