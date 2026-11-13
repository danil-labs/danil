/** Shared email ordering and refusal messages. */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { elegirLengua } from "../../src/lib/i18n.ts";
import { AccountEmailsError, emailErrorText, emailRows } from "../../src/features/settings/account-emails.ts";

test("rows: primary first, then confirmed, then pending without duplicates", () => {
  const rows = emailRows({
    emails: [
      { email: "b@x.mx", primary: false, verified: false },
      { email: "c@x.mx", primary: false, verified: true },
      { email: "a@x.mx", primary: true, verified: true },
    ],
    pending: [{ email: "b@x.mx", resendAfter: 10 }, { email: "d@x.mx", resendAfter: 5 }],
  });
  assert.deepEqual(rows.map((r) => r.email), ["a@x.mx", "c@x.mx", "b@x.mx", "d@x.mx"]);
  assert.equal(rows[3].resendAfter, 5);
});

test("refusals read from the catalog, with the address and the attempts left", () => {
  elegirLengua("es");
  assert.equal(emailErrorText(new AccountEmailsError("code_invalid", 3)), "Ese código no coincide. Te quedan 3 intentos.");
  assert.equal(emailErrorText(new AccountEmailsError("code_invalid", 1)), "Ese código no coincide. Te queda 1 intento.");
  assert.match(emailErrorText(new AccountEmailsError("email_in_use"), "b@x.mx"), /^b@x\.mx ya pertenece a otra cuenta de Danil/);
  assert.equal(emailErrorText(new AccountEmailsError("http_500")), "No se pudo completar el cambio. Intenta de nuevo.");
  assert.equal(emailErrorText(new Error("x")), "No se pudo completar el cambio. Intenta de nuevo.");
});
