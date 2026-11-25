import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import {
  aplicarLenguaDeWorkspace,
  elegirLengua,
  lengua,
  lenguasDisponibles,
  manifiesto,
  refreshLanguage,
  sumarFrases,
  t,
} from "../../src/lib/i18n.ts";
import { df, nf } from "../../src/lib/format.ts";

test("Maayatʼaan (yua) ships as a built-in locale alongside es and en", () => {
  const disponibles = lenguasDisponibles();
  const codigos = disponibles.map((m) => m.codigo);
  assert.ok(codigos.includes("es"), "es is built-in");
  assert.ok(codigos.includes("en"), "en is built-in");
  assert.ok(codigos.includes("yua"), "yua is built-in");
  const yua = disponibles.find((m) => m.codigo === "yua");
  assert.equal(yua?.endonimo, "Maayatʼaan");
  assert.equal(yua?.formato, "es-MX");
  assert.equal(yua?.direccion, "ltr");
});

test("switching to yua renders Maayatʼaan phrases and falls back cleanly to es/en", () => {
  elegirLengua("yua");
  assert.equal(lengua(), "yua");
  assert.equal(manifiesto().formato, "es-MX");
  assert.equal(t("settings.language.title"), "Tʼaan");
  assert.equal(t("settings.language.system"), "Jeʼex le computadoraaʼ");

  // Keys not translated in yua fall back to es without returning raw keys.
  assert.equal(t("settings.language.app"), "Lengua de la app");

  // Keys missing in both yua and es fall back to en before returning the key.
  sumarFrases("en", { "test.only_en_fallback": "English fallback" });
  assert.equal(t("test.only_en_fallback"), "English fallback");

  // Intl formatting uses es-MX cleanly under yua.
  assert.equal(df({ month: "long" }).format(new Date(2026, 8, 20)), "septiembre");
  assert.ok(nf().format(1234).includes("1"));

  elegirLengua("es");
});

test("persisting yua in a workspace survives refreshLanguage without reverting", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  try {
    aplicarLenguaDeWorkspace("yua");
    assert.equal(lengua(), "yua");
    assert.equal(values.get("harness:lengua:ultima"), "yua");
    refreshLanguage();
    assert.equal(lengua(), "yua");
  } finally {
    aplicarLenguaDeWorkspace("es");
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
