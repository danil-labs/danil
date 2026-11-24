import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const { base64De: toBase64, copyText, imagenPegada: pastedImage } = await import("../../../../packages/host/src/clipboard.ts");
const { elegirLengua: chooseLanguage, registrarCatalogo: registerCatalog, t } = await import("../../src/lib/i18n.ts");

const repoRoot = resolve(import.meta.dirname, "../..");
const readJson = (path: string) => JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
registerCatalog(readJson("src/locales/es/manifiesto.json"), readJson("src/locales/es/common.json"));
chooseLanguage("es");

type FakeItem = { kind: string; type: string; getAsFile: () => unknown };

const clipboard = (items: FakeItem[]) =>
  ({ items }) as unknown as Parameters<typeof pastedImage>[0];

const file = (type: string) => ({ type, nombre: "falso" });

test("Un ítem de texto no cuenta aunque diga ser imagen", () => {
  const trap = clipboard([
    { kind: "string", type: "image/png", getAsFile: () => null },
  ]);
  assert.equal(pastedImage(trap), null);
});

test("Un ítem de archivo sin archivo detrás no cuenta", () => {
  const empty = clipboard([
    { kind: "file", type: "image/png", getAsFile: () => null },
  ]);
  assert.equal(pastedImage(empty), null);
});

test("Entre texto y una imagen se queda con la imagen", () => {
  const png = file("image/png");
  const mixed = clipboard([
    { kind: "string", type: "text/html", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => png },
  ]);
  assert.equal(pastedImage(mixed), png);
});

test("Un archivo que no es imagen no se adjunta al pegar", () => {
  const pdf = clipboard([
    { kind: "file", type: "application/pdf", getAsFile: () => file("application/pdf") },
  ]);
  assert.equal(pastedImage(pdf), null);
});

test("Los bytes van sin la cabecera del data URI", async () => {
  class FakeReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(b: { datos: string }) {
      this.result = b.datos;
      this.onload?.();
    }
  }
  const previous = globalThis.FileReader;
  globalThis.FileReader = FakeReader as never;
  try {
    const blob = { datos: "data:image/png;base64,QUJD" } as never;
    assert.equal(await toBase64(blob), "QUJD");
  } finally {
    globalThis.FileReader = previous;
  }
});

test("Un lector que falla rechaza con la clave del catálogo", async () => {
  class BrokenReader {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      this.onerror?.();
    }
  }
  const previous = globalThis.FileReader;
  globalThis.FileReader = BrokenReader as never;
  try {
    await assert.rejects(toBase64({} as never), (e: unknown) => {
      assert.deepEqual(e, {
        what: { clave: "chat.attachments.paste_unreadable" },
        detail: "",
      });
      return true;
    });
  } finally {
    globalThis.FileReader = previous;
  }
});

const ipc = (respond: (cmd: string, args: unknown) => unknown) => {
  const previous = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string, args: unknown) => respond(cmd, args),
      transformCallback: (f: unknown) => f,
    },
  };
  return () => {
    (globalThis as Record<string, unknown>).window = previous;
  };
};

test("Copiar va al portapapeles del sistema, sin pedir gesto al webview", async () => {
  const seen: { cmd?: string; args?: unknown } = {};
  const release = ipc((cmd, args) => {
    seen.cmd = cmd;
    seen.args = args;
    return null;
  });
  try {
    await copyText("ruta/que/copiar");
  } finally {
    release();
  }
  assert.equal(seen.cmd, "plugin:clipboard-manager|write_text");
  assert.deepEqual(seen.args, { label: undefined, text: "ruta/que/copiar" });
});

test("Un portapapeles que falla rechaza con la clave del catálogo", async () => {
  const release = ipc(() => {
    throw "clipboard error: no pasteboard";
  });
  try {
    await assert.rejects(copyText("lo que sea"), (e: unknown) => {
      assert.deepEqual(e, {
        what: t("common.clipboard.write_failed"),
        detail: "clipboard error: no pasteboard",
      });
      assert.notEqual(t("common.clipboard.write_failed"), "common.clipboard.write_failed");
      return true;
    });
  } finally {
    release();
  }
});
