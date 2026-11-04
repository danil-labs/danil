/**
 * «Agregar cuenta» in the browser starts like Google's «Elige una cuenta»: the
 * Danil accounts already signed in here open with one click, an expired one
 * goes to the form with its email, and «Usar otra cuenta» goes to the form;
 * from there the list is one click back. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const until = async (check, ms = 4000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (check()) return true;
    await sleep(50);
  }
  return false;
};

const client = (user) => ({
  user: async () => user,
  getToken: async () => "tok",
  unauthorized: async () => false,
  signOutLocal: async () => undefined,
});

test("«Agregar cuenta» offers the accounts already signed in before another one", async () => {
  let storage = null;
  const app = await boot("listo", "web-account-chooser", {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      storage = w.localStorage;
      w.terminusWeb = {
        addAccount: {
          storage: w.localStorage,
          accounts: [
            { user_id: "u-alberto", email: "alberto@danil.ai", name: "Alberto", slot: null, signedIn: true, client: client(null) },
            { user_id: "u-ytw", email: "alberto@ytw.mx", name: null, slot: "s2", signedIn: false, client: client(null) },
          ],
          clientFor: () => {
            throw new Error("the chooser signs nobody in");
          },
          home: "https://app.danil.ai/terminus/",
          email: null,
          callback: null,
          code: null,
          error: null,
        },
      };
    },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-account-chooser]")), "the chooser comes first");
  const rows = () => [...doc.querySelectorAll("[data-chooser-account]")].map((b) => [b.getAttribute("data-chooser-account"), b.getAttribute("data-chooser-action")]);
  assert.deepEqual(rows(), [
    ["u-alberto", "open"],
    ["u-ytw", "sign_in_again"],
  ]);

  // An expired account goes to the form with its email.
  doc.querySelector('[data-chooser-account="u-ytw"]').click();
  assert.ok(await until(() => doc.querySelector("[data-add-account-page]")));
  assert.equal(doc.querySelector('input[type="email"]').value, "alberto@ytw.mx");

  // Back to the list, then «Usar otra cuenta» opens an empty form.
  doc.querySelector("[data-chooser-back]").click();
  assert.ok(await until(() => doc.querySelector("[data-account-chooser]")));
  doc.querySelector("[data-chooser-another]").click();
  assert.ok(await until(() => doc.querySelector("[data-add-account-page]")));

  // An account signed in opens as the one the page mounts next.
  doc.querySelector("[data-chooser-back]").click();
  assert.ok(await until(() => doc.querySelector("[data-account-chooser]")));
  doc.querySelector('[data-chooser-account="u-alberto"]').click();
  assert.equal(storage.getItem("terminus.web.account"), JSON.stringify("u-alberto"));
});

test("with no account here, «Agregar cuenta» goes straight to the form", async () => {
  const app = await boot("listo", "web-account-chooser-empty", {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      w.terminusWeb = {
        addAccount: { storage: w.localStorage, accounts: [], clientFor: () => null, home: "https://app.danil.ai/terminus/", email: null, callback: null, code: null, error: null },
      };
    },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-add-account-page]")));
  assert.equal(doc.querySelector("[data-account-chooser]"), null);
  assert.equal(doc.querySelector("[data-chooser-back]"), null, "no list to go back to");
});
