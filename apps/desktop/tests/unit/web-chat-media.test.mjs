/**
 * In the browser the disk is the remote computer's: an image the answer names
 * by its path arrives through `preview_file` as `data:`, and a chat visual is
 * read with `tree_show` from that computer. A file attached with the button or
 * dropped on the chat travels as bytes and the engine saves it there with
 * `guardar_adjunto` when the machine announces `attachment_documents_v1`; an
 * older engine keeps receiving images only. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const IMAGE = "/Users/ana/exchange/chart.png";
const VISUAL = "<!doctype html><meta name=\"harness-artefacto\" content=\"web\"><p>grafica viva</p>";
const answer = `Mira:\n\n![captura](${IMAGE})\n\n::terminus-visual{file="chart-1.html" title="Turnos"}\n\nListo.`;
const MAC = { computer_id: "cmp_mac", name: "MacBook Air", state: "online", provider: "self", kind: "physical", service_features: ["attachment_documents_v1"] };
const OLD_MAC = { ...MAC, service_features: [] };

async function open(name, computer = MAC) {
  const f = fleet({
    cmp_mac: {
      table: {
        ...engine,
        load_session: ({ id }) => ({ ...engine.load_session({ id }), turns: [
          { role: "user", id: "u0", at: 0, text: "hazme una gráfica" },
          { role: "agent", id: "a1", at: 1, text: answer },
        ] }),
        guardar_imagen_pegada: ({ mime }) => `/tmp/captura-1.${mime.split("/")[1]}`,
        guardar_adjunto: ({ nombre, mime }) => `/tmp/adjunto-1-${nombre ?? `sin-nombre.${mime.split("/")[1]}`}`,
        prepare_attachments: ({ paths }) => paths,
        preview_file: ({ path }) => ({ kind: "image", data_url: path === IMAGE ? PNG : null }),
        file_size: 10,
        tree_show: ({ tree, path }) => (tree === "terminus-chat-visuals" && path === "chart-1.html"
          ? { kind: "text", text: VISUAL, bytes: new TextEncoder().encode(VISUAL).byteLength, truncated: false }
          : null),
      },
    },
  });
  const app = await boot("listo", name, {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      // Everything is on screen: the visual reads as soon as it mounts.
      globalThis.IntersectionObserver = w.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; }
        observe(target) { setTimeout(() => this.callback([{ isIntersecting: true, target }], this), 0); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
      w.terminusWeb = { endpoint: "https://relay.test", computers: [computer], getToken: async () => "tok" };
    },
  });
  await sleep(2500);
  const doc = app.w.document;
  const row = doc.querySelector('[data-sesion="cmp_mac~t1"]');
  assert.ok(row, "no está la fila de t1");
  row.click();
  await sleep(1500);
  const calls = (command) => f.relays.cmp_mac.calls.filter((c) => c.command === command);
  return { app, doc, calls };
}

test("la imagen y el visual de una respuesta se pintan en la web", async () => {
  const { doc, calls } = await open("web-chat-media");
  assert.ok(calls("preview_file").some((c) => c.args.path === IMAGE), "no pidió la imagen");
  assert.ok([...doc.querySelectorAll("img")].some((img) => img.getAttribute("src") === PNG), "no pintó la imagen");
  const visual = calls("tree_show").find((c) => c.args.tree === "terminus-chat-visuals");
  assert.ok(visual, "no leyó el visual");
  assert.equal(visual.workspace, "w");
  assert.ok([...doc.querySelectorAll("iframe")].some((f) => (f.getAttribute("srcdoc") ?? "").includes("grafica viva")), "no pintó el visual");
});

/** El selector del navegador: captura el `accept` y entrega los archivos que se le pidan. */
function picker(w, doc, files) {
  let input;
  const click = w.HTMLInputElement.prototype.click;
  w.HTMLInputElement.prototype.click = function () {
    if (this.type !== "file") return click.call(this);
    input = this;
    Object.defineProperty(this, "files", { value: files });
    this.onchange?.();
  };
  doc.querySelector('[aria-label="Adjuntar un archivo"]').click();
  return () => input;
}

function drop(w, doc, files) {
  const event = new w.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files } });
  doc.querySelector('[aria-label="Adjuntar un archivo"]').dispatchEvent(event);
  return event;
}

test("en la web se adjuntan imágenes y PDF con el botón y soltándolos, con su nombre", async () => {
  const { app, doc, calls } = await open("web-chat-attach");
  const w = app.w;
  const png = new w.File([new Uint8Array([137, 80, 78, 71])], "foto.png", { type: "image/png" });
  const pdf = new w.File(["%PDF"], "plan.pdf", { type: "application/pdf" });
  const pickerDe = picker(w, doc, [png]);
  await sleep(500);
  const input = pickerDe();
  assert.ok(input, "no abrió el selector del navegador");
  assert.match(input.accept, /application\/pdf/);
  assert.equal(calls("guardar_adjunto").length, 1);
  assert.deepEqual([calls("guardar_adjunto")[0].args.mime, calls("guardar_adjunto")[0].args.nombre], ["image/png", "foto.png"]);
  assert.deepEqual(calls("prepare_attachments").at(-1).args.paths, ["/tmp/adjunto-1-foto.png"]);

  const soltar = drop(w, doc, [new w.File(["GIF89a"], "anim.gif", { type: "image/gif" }), pdf]);
  await sleep(500);
  assert.ok(soltar.defaultPrevented, "el navegador abriría el archivo");
  assert.equal(calls("guardar_adjunto").at(-2).args.mime, "image/gif");
  assert.equal(calls("guardar_adjunto").at(-1).args.mime, "application/pdf");
  assert.deepEqual(calls("prepare_attachments").at(-1).args.paths, ["/tmp/adjunto-1-anim.gif", "/tmp/adjunto-1-plan.pdf"]);
  assert.ok(!doc.body.textContent.includes("No se adjuntó"), "explicó un archivo que sí se adjuntó");
});

test("en la web un tipo desconocido o demasiado grande se explica", async () => {
  const { app, doc, calls } = await open("web-chat-unsupported");
  const w = app.w;
  const exe = new w.File(["MZ"], "setup.exe", { type: "application/x-msdownload" });
  drop(w, doc, [exe]);
  await sleep(500);
  assert.equal(calls("guardar_adjunto").length, 0);
  assert.ok(doc.body.textContent.includes("No se adjuntó: setup.exe"), "no explicó el archivo");
});

test("una máquina con un motor anterior solo recibe imágenes, y el documento se explica", async () => {
  const { app, doc, calls } = await open("web-chat-old", OLD_MAC);
  const w = app.w;
  const png = new w.File([new Uint8Array([137, 80, 78, 71])], "foto.png", { type: "image/png" });
  const pdf = new w.File(["%PDF"], "plan.pdf", { type: "application/pdf" });
  const pickerDe = picker(w, doc, [png]);
  await sleep(500);
  assert.doesNotMatch(pickerDe().accept, /application\/pdf/);
  assert.equal(calls("guardar_adjunto").length, 0);
  assert.deepEqual([calls("guardar_imagen_pegada")[0].args.mime], ["image/png"]);

  drop(w, doc, [pdf]);
  await sleep(500);
  assert.equal(calls("guardar_adjunto").length, 0);
  assert.ok(doc.body.textContent.includes("No se adjuntó: plan.pdf"), "no explicó el PDF");
  assert.ok(doc.body.textContent.includes("no actualiza su motor"), "no dijo por qué");
});
