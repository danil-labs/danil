/**
 * Los correos de la cuenta en la web: el cliente de `/auth/emails` por el proxy
 * de alfa contra un `fetch` falso, el orden de la lista y los textos de rechazo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { AccountEmailsError, emailErrorText, emailRows } from "../../src/features/settings/account-emails.ts";
import { elegirLengua } from "../../src/lib/i18n.ts";
import { webAccountEmails } from "../../src/web/account-emails.ts";

type Seen = { url: string; init: RequestInit };

function fake(handler: (url: string, init: RequestInit, n: number) => { status: number; body?: unknown }) {
  const seen: Seen[] = [];
  const f = async (url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    const { status, body } = handler(url, init, seen.length);
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  };
  return { f, seen };
}

const session = (refresh = true) => {
  const calls = { refresh: 0 };
  return {
    calls,
    getToken: async () => `tok${calls.refresh}`,
    unauthorized: async () => {
      calls.refresh++;
      return refresh;
    },
  };
};

test("list reads /auth/emails through the alpha proxy with the session", async () => {
  const { f, seen } = fake(() => ({
    status: 200,
    body: {
      emails: [{ email: "ana@x.mx", primary: true, verified: true }, { bad: 1 }],
      pending: [{ email: "b@x.mx", resend_after: 42 }],
      blocked: [{ email: "c@x.mx", reason: "in_use" }, { email: "d@x.mx", reason: "other" }, { reason: "needs_support" }],
    },
  }));
  const s = session();
  const list = await webAccountEmails(s, "/alpha-api", f).list();
  assert.deepEqual(list, {
    emails: [{ email: "ana@x.mx", primary: true, verified: true }],
    pending: [{ email: "b@x.mx", resendAfter: 42 }],
    blocked: [{ email: "c@x.mx", reason: "in_use" }],
  });
  assert.equal(seen[0].url, "/alpha-api/auth/emails");
  assert.equal(seen[0].init.method, "GET");
  assert.equal((seen[0].init.headers as Record<string, string>).Authorization, "Bearer tok0");
});

test("writes post only the email and the code as JSON", async () => {
  const { f, seen } = fake((url) => ({ status: 200, body: url.endsWith("/auth/emails") ? { email: "b@x.mx", expires_in: 900, resend_after: 60 } : { ok: true } }));
  const s = session();
  const api = webAccountEmails(s, "/alpha-api", f);
  assert.deepEqual(await api.requestCode("b@x.mx"), { email: "b@x.mx", expiresIn: 900, resendAfter: 60 });
  await api.confirmCode("b@x.mx", "123456");
  await api.makePrimary("b@x.mx");
  await api.remove("c@x.mx");
  assert.deepEqual(
    seen.map((c) => [c.url, c.init.method, c.init.body]),
    [
      ["/alpha-api/auth/emails", "POST", '{"email":"b@x.mx"}'],
      ["/alpha-api/auth/emails/verify", "POST", '{"email":"b@x.mx","code":"123456"}'],
      ["/alpha-api/auth/emails/primary", "POST", '{"email":"b@x.mx"}'],
      ["/alpha-api/auth/emails/remove", "POST", '{"email":"c@x.mx"}'],
    ],
  );
  // Tras cambiar el principal la sesión se refresca: el JWT traía el correo anterior.
  assert.equal(s.calls.refresh, 1);
});

test("a 401 refreshes once and retries; a refusal keeps its code and details", async () => {
  const { f, seen } = fake((_u, _i, n) => (n === 1 ? { status: 401 } : { status: 400, body: { error: "code_invalid", attempts_left: 2 } }));
  const s = session();
  await assert.rejects(webAccountEmails(s, "/alpha-api", f).confirmCode("b@x.mx", "000000"), (err: unknown) => {
    assert.ok(err instanceof AccountEmailsError);
    assert.equal(err.code, "code_invalid");
    assert.equal(err.attemptsLeft, 2);
    return true;
  });
  assert.equal(seen.length, 2);
  assert.equal((seen[1].init.headers as Record<string, string>).Authorization, "Bearer tok1");

  const limited = fake(() => ({ status: 429, body: { error: "rate_limited", resend_after: 30 } }));
  await assert.rejects(webAccountEmails(session(), "/alpha-api", limited.f).requestCode("b@x.mx"), (err: unknown) => err instanceof AccountEmailsError && err.resendAfter === 30);
});

test("rows: primary first, then confirmed, then pending without duplicates, then blocked", () => {
  const rows = emailRows({
    emails: [
      { email: "b@x.mx", primary: false, verified: false },
      { email: "c@x.mx", primary: false, verified: true },
      { email: "a@x.mx", primary: true, verified: true },
    ],
    pending: [{ email: "b@x.mx", resendAfter: 10 }, { email: "d@x.mx", resendAfter: 5 }, { email: "e@x.mx", resendAfter: 5 }],
    blocked: [{ email: "e@x.mx", reason: "in_use" }, { email: "f@x.mx", reason: "needs_support" }],
  });
  assert.deepEqual(rows.map((r) => r.email), ["a@x.mx", "c@x.mx", "b@x.mx", "d@x.mx", "e@x.mx", "f@x.mx"]);
  assert.equal(rows[3].resendAfter, 5);
  assert.equal(rows[4].blocked, "in_use");
  assert.equal(rows[5].blocked, "needs_support");
  assert.equal(rows[0].blocked, null);
});

test("merging reads the preview, sends the email, and an older window has no preview", async () => {
  const { f, seen } = fake((url) =>
    url.includes("/merge?")
      ? {
          status: 200,
          body: {
            emails: ["aceballos.ext@bancodonde.com", "otro@x.mx"],
            logins: ["workos"],
            memberships: [{ account: "PRN", role: "admin" }, { role: "sin cuenta" }],
            blockers: [],
          },
        }
      : { status: 200, body: { ok: true } },
  );
  const api = webAccountEmails(session(), "/alpha-api", f);
  assert.deepEqual(await api.previewMerge("aceballos.ext@bancodonde.com"), {
    emails: ["aceballos.ext@bancodonde.com", "otro@x.mx"],
    logins: ["workos"],
    memberships: [{ account: "PRN", role: "admin" }],
    blockers: [],
  });
  await api.mergePerson("aceballos.ext@bancodonde.com");
  assert.deepEqual(
    seen.map((c) => [c.url, c.init.method, c.init.body]),
    [
      ["/alpha-api/auth/emails/merge?email=aceballos.ext%40bancodonde.com", "GET", undefined],
      ["/alpha-api/auth/emails/merge", "POST", '{"email":"aceballos.ext@bancodonde.com"}'],
    ],
  );

  const old = fake(() => ({ status: 404, body: { error: "not_found" } }));
  assert.equal(await webAccountEmails(session(), "/alpha-api", old.f).previewMerge("b@x.mx"), null);
});

test("refusals read from the catalog, with the address and the attempts left", () => {
  elegirLengua("es");
  assert.equal(emailErrorText(new AccountEmailsError("code_invalid", 3)), "Ese código no coincide. Te quedan 3 intentos.");
  assert.equal(emailErrorText(new AccountEmailsError("code_invalid", 1)), "Ese código no coincide. Te queda 1 intento.");
  assert.match(emailErrorText(new AccountEmailsError("email_in_use"), "b@x.mx"), /^b@x\.mx ya pertenece a otra cuenta de Danil/);
  assert.match(emailErrorText(new AccountEmailsError("merge_unavailable")), /^Unir cuentas todavía no se puede/);
  assert.equal(emailErrorText(new AccountEmailsError("http_500")), "No se pudo completar el cambio. Intenta de nuevo.");
  assert.equal(emailErrorText(new Error("x")), "No se pudo completar el cambio. Intenta de nuevo.");
});
