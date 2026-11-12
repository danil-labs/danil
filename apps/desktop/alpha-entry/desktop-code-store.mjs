/** Un objeto por código: el consumo confirmado precede a cualquier efecto en GoTrue. */
export class DesktopCodeStore {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const { exp } = await request.json();
    if (!Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return new Response(null, { status: 401 });
    await this.storage.setAlarm(exp * 1000);
    const consumed = await this.storage.transaction(async txn => {
      if (await txn.get("consumed") || exp <= Math.floor(Date.now() / 1000)) return false;
      await txn.put("consumed", true);
      return true;
    });
    return new Response(null, { status: consumed ? 204 : 401 });
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}
