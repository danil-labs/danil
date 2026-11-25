import assert from "node:assert/strict";
import { test } from "node:test";
import { screenConnection, type Phase } from "../../../../packages/features/screen/src/queries/connection.ts";
import { capabilities, openMachineScreen, setCapabilities } from "../../../../packages/host/src/platform.ts";
import { createScreenAccess } from "@terminus/computers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

class Socket extends EventTarget {
  closes = 0;
  close() { this.closes++; }
  end(code: number) { this.dispatchEvent(Object.assign(new Event("close"), { code })); }
  web() { return this as unknown as WebSocket; }
}

function fixture(extra: Partial<Parameters<typeof screenConnection>[0]> = {}) {
  const phases: Phase[] = [];
  const sockets: Socket[] = [];
  const views: Viewer[] = [];
  class Viewer extends EventTarget {
    viewOnly = false;
    scaleViewport = false;
    background = "";
    disconnected = false;
    constructor(_target: HTMLElement, socket: WebSocket) {
      super();
      views.push(this);
      socket.addEventListener("close", () => this.dispatchEvent(new Event("disconnect")));
    }
    disconnect() { this.disconnected = true; this.dispatchEvent(new Event("disconnect")); }
  }
  const module = { default: Viewer };
  const connection = screenConnection({
    target: { replaceChildren() {} } as HTMLElement,
    load: async () => module,
    open: async () => { const socket = new Socket(); sockets.push(socket); return socket.web(); },
    phase: (phase) => phases.push(phase),
    ...extra,
  });
  return { connection, phases, sockets, views, module };
}

test("el socket espera al visor para no perder la cabecera RFB durante el import", async () => {
  const ready = deferred<ReturnType<typeof fixture>["module"]>();
  const f = fixture({ load: () => ready.promise });
  const connecting = f.connection.connect();
  await Promise.resolve();
  assert.equal(f.sockets.length, 0);
  ready.resolve(f.module);
  await connecting;
  assert.equal(f.sockets.length, 1);
  assert.equal(f.views[0].viewOnly, true);
  assert.equal(f.views[0].scaleViewport, true);
  f.views[0].dispatchEvent(new Event("connect"));
  assert.equal(f.phases.at(-1), "live");
  f.connection.disconnect();
  assert.equal(f.views[0].disconnected, true);
  assert.equal(f.sockets[0].closes, 1);
});

test("cerrar mientras carga el visor impide abrir un socket después", async () => {
  const ready = deferred<ReturnType<typeof fixture>["module"]>();
  const f = fixture({ load: () => ready.promise });
  const connecting = f.connection.connect();
  f.connection.disconnect();
  ready.resolve(f.module);
  await connecting;
  assert.equal(f.sockets.length, 0);
});

test("un socket que llega después de cerrar el visor se cierra sin montar noVNC", async () => {
  const ready = deferred<WebSocket>();
  const f = fixture({ open: () => ready.promise });
  const connecting = f.connection.connect();
  await Promise.resolve();
  f.connection.disconnect();
  const socket = new Socket();
  ready.resolve(socket.web());
  await connecting;
  assert.equal(socket.closes, 1);
  assert.equal(f.views.length, 0);
});

test("un import fallido no abre la conexión", async () => {
  const f = fixture({ load: async () => { throw new Error("import failed"); } });
  await f.connection.connect();
  assert.equal(f.sockets.length, 0);
  assert.equal(f.phases.at(-1), "failed");
});

test("si el constructor falla el socket no queda abierto", async () => {
  class Broken extends EventTarget {
    viewOnly = false;
    scaleViewport = false;
    background = "";
    constructor() { super(); throw new Error("viewer failed"); }
    disconnect() {}
  }
  const f = fixture({ load: async () => ({ default: Broken }) });
  await f.connection.connect();
  assert.equal(f.sockets[0].closes, 1);
  assert.equal(f.phases.at(-1), "failed");
});

test("reconectar cierra el intento anterior y sus eventos ya no cambian el estado", async () => {
  const f = fixture();
  await f.connection.connect();
  await f.connection.connect();
  assert.equal(f.sockets[0].closes, 1);
  assert.equal(f.views[0].disconnected, true);
  f.views[0].dispatchEvent(new Event("connect"));
  f.sockets[0].end(4010);
  assert.equal(f.phases.at(-1), "connecting");
  f.views[1].dispatchEvent(new Event("connect"));
  f.sockets[1].end(1000);
  assert.equal(f.phases.at(-1), "ended");
  f.connection.disconnect();
});

test("el cierre temprano conserva la razón del relay", async () => {
  for (const [code, phase] of [[4010, "offline"], [4011, "unavailable"], [4013, "busy"]] as const) {
    const f = fixture();
    await f.connection.connect();
    f.sockets[0].end(code);
    assert.equal(f.phases.at(-1), phase);
    f.connection.disconnect();
  }
});

test("una pestaña que sobrevive a la sesión usa el acceso nuevo al reconectar", async () => {
  const previous = capabilities();
  const sockets: Socket[] = [];
  const install = () => {
    const access = createScreenAccess({
      endpoint: "https://relay.test",
      knows: (id) => id === "self",
      getToken: async () => "token",
      socket: () => { const socket = new Socket(); sockets.push(socket); return socket.web(); },
    });
    setCapabilities({ ...previous, machineScreen: access.opener });
    return access;
  };
  try {
    const original = install();
    const old = capabilities().machineScreen!("self")!;
    const tab = fixture({ open: () => openMachineScreen("self") });
    await tab.connection.connect();
    original.close();
    setCapabilities(previous);
    await tab.connection.connect();
    assert.equal(tab.phases.at(-1), "failed");
    const replacement = install();
    await tab.connection.connect();
    assert.equal(tab.views.length, 2);
    assert.equal(tab.phases.at(-1), "connecting");
    assert.equal(sockets.length, 2);
    await assert.rejects(old(), /screen_unavailable/);
    tab.connection.disconnect();
    replacement.close();
  } finally {
    setCapabilities(previous);
  }
});
