// Pantalla de entrada sin sesión: el borde contesta 401 en /me.
export default {
  async old(page) { await unauth(page); },
  async new(page) { await unauth(page); },
};
async function unauth(page) {
  await page.route("https://edge.danil.ai/v1/identity/me", (r) => r.fulfill({ status: 401, headers: { "content-type": "application/json", "access-control-allow-origin": r.request().headers().origin ?? "*", "access-control-allow-credentials": "true" }, body: '{"error":"unauthenticated"}' }));
  await page.reload();
  await page.waitForTimeout(1500);
}
