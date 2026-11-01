import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { pageTimeoutMsFor } from "../src/shared/config.ts";
import {
  RELOADED_ERROR as RELOADED,
  SILENT_ERROR as SILENT,
  TIMEOUT_ERROR as TIMEOUT,
  requestCorrection,
} from "../src/content/worker.ts";

/** Minuteurs contrôlés à la main : le filet se déclenche sur ordre, pas sur l'horloge. */
let timers: Array<{ fn: () => void; ms: number; annulé: boolean }>;
let envoyé: unknown[];

function installer(reponse: () => Promise<unknown>, avecId = true): void {
  timers = [];
  envoyé = [];
  (globalThis as any).window = {
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms, annulé: false }),
    clearTimeout: (id: number) => {
      const t = timers[id - 1];
      if (t) t.annulé = true;
    },
  };
  (globalThis as any).chrome = {
    runtime: {
      ...(avecId ? { id: "abcdef" } : {}),
      sendMessage: (msg: unknown) => {
        envoyé.push(msg);
        return reponse();
      },
    },
  };
}

const jamais = () => new Promise<unknown>(() => {});

beforeEach(() => installer(async () => undefined));

test("la réponse du worker est transmise telle quelle", async () => {
  installer(async () => ({ ok: true, text: "corrigé" }));
  assert.deepEqual(await requestCorrection("brouillon"), { ok: true, text: "corrigé" });
});

test("le message envoyé porte le type et le texte attendus", async () => {
  installer(async () => ({ ok: true, text: "x" }));
  await requestCorrection("mon tweet");
  assert.deepEqual(envoyé, [{ type: "xcorrect:correct", text: "mon tweet" }]);
});

test("un worker qui répond vide donne un message d'attente, pas un plantage", async () => {
  installer(async () => undefined);
  assert.deepEqual(await requestCorrection("brouillon"), { ok: false, error: SILENT });
});

test("extension rechargée sous la page : le message invite à actualiser", async () => {
  // runtime.id disparaît quand l'extension a été rechargée : c'est le seul
  // signal qui distingue ce cas d'un worker simplement muet.
  installer(() => Promise.reject(new Error("context invalidated")), false);
  assert.deepEqual(await requestCorrection("brouillon"), { ok: false, error: RELOADED });
});

test("worker injoignable mais extension vivante : on invite à réessayer", async () => {
  installer(() => Promise.reject(new Error("no receiving end")), true);
  assert.deepEqual(await requestCorrection("brouillon"), { ok: false, error: SILENT });
});

test("le filet se déclenche si le worker ne répond jamais", async () => {
  installer(jamais);
  const promesse = requestCorrection("brouillon");
  assert.equal(timers.length, 1, "un minuteur doit être armé");
  timers[0]!.fn();
  assert.deepEqual(await promesse, { ok: false, error: TIMEOUT });
});

test("le délai du filet suit la longueur du texte", async () => {
  for (const texte of ["court", "x".repeat(280), "x".repeat(25_000)]) {
    installer(jamais);
    void requestCorrection(texte);
    assert.equal(timers[0]!.ms, pageTimeoutMsFor(texte));
  }
});

test("le minuteur est annulé dès que le worker répond", async () => {
  installer(async () => ({ ok: true, text: "corrigé" }));
  await requestCorrection("brouillon");
  assert.equal(timers[0]!.annulé, true, "un minuteur laissé actif fuite à chaque correction");
});
