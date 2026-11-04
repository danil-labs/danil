import assert from "node:assert/strict";
import test from "node:test";

import { attachmentsOn, moveAttachments, NotMovable, type AttachmentMover } from "../../src/lib/remoteAttachments.ts";

/** Dos motores: la Mac de la ventana tiene los archivos; la VM, lo que se le sube. */
function motores(mac: Record<string, { data_url?: string | null; pdf?: string | null }>, documentos = true) {
  const vm: Record<string, string> = {};
  const llamadas: string[] = [];
  const c: AttachmentMover = {
    documentos,
    async read(ruta) {
      llamadas.push(`mac:preview_file ${ruta}`);
      if (!(ruta in mac)) throw new Error("No se pudo leer");
      return mac[ruta];
    },
    async save(mime, datos, nombre) {
      const ruta = `/tmp/adjunto-${Object.keys(vm).length}-${nombre}`;
      vm[ruta] = datos;
      llamadas.push(`vm:guardar_adjunto ${mime} ${nombre}`);
      return ruta;
    },
    async prepare(rutas) {
      llamadas.push(`vm:prepare_attachments ${rutas.join(",")}`);
      return rutas.map((r) => `/home/alberto/.terminus/attachments/x/${r.split("/").pop()}`);
    },
  };
  return { c, vm, llamadas };
}

test("una imagen arrastrada en la Mac llega a la VM como bytes y vuelve con su ruta de allá", async () => {
  const { c, vm, llamadas } = motores({ "/Users/alberto/Desktop/Captura.png": { data_url: "data:image/png;base64,iVBORw0K" } });
  const rutas = await moveAttachments(["/Users/alberto/Desktop/Captura.png"], c);
  assert.deepEqual(rutas, ["/home/alberto/.terminus/attachments/x/adjunto-0-Captura.png"]);
  assert.deepEqual(Object.values(vm), ["iVBORw0K"]);
  assert.deepEqual(llamadas, [
    "mac:preview_file /Users/alberto/Desktop/Captura.png",
    "vm:guardar_adjunto image/png Captura.png",
    "vm:prepare_attachments /tmp/adjunto-0-Captura.png",
  ]);
});

test("un PDF llega a la VM con sus bytes y su nombre", async () => {
  const { c, vm } = motores({ "/Users/alberto/informe.pdf": { pdf: "JVBERi0=" } });
  const rutas = await moveAttachments(["/Users/alberto/informe.pdf"], c);
  assert.deepEqual(rutas, ["/home/alberto/.terminus/attachments/x/adjunto-0-informe.pdf"]);
  assert.deepEqual(Object.values(vm), ["JVBERi0="]);
});

test("sin la extensión de documentos el PDF no sale, y no deja nada a medias en la VM", async () => {
  const { c, vm } = motores({
    "/Users/alberto/a.png": { data_url: "data:image/png;base64,AAAA" },
    "/Users/alberto/informe.pdf": { pdf: "JVBERi0=" },
  }, false);
  await assert.rejects(
    moveAttachments(["/Users/alberto/a.png", "/Users/alberto/informe.pdf"], c),
    (e: unknown) => e instanceof NotMovable && e.names.join() === "informe.pdf",
  );
  assert.deepEqual(vm, {});
});

test("un archivo que no es imagen ni PDF, o que ya no está, no sale", async () => {
  const { c, vm } = motores({
    "/Users/alberto/a.png": { data_url: "data:image/png;base64,AAAA" },
    "/Users/alberto/informe.docx": { data_url: null },
    "/Users/alberto/logo.svg": { data_url: "data:image/svg+xml;base64,PHN2Zz4=" },
  });
  await assert.rejects(
    moveAttachments(["/Users/alberto/a.png", "/Users/alberto/informe.docx", "/Users/alberto/logo.svg", "/Users/alberto/borrada.png"], c),
    (e: unknown) => e instanceof NotMovable && e.names.join() === "informe.docx,logo.svg,borrada.png",
  );
  assert.deepEqual(vm, {});
});

test("sin adjuntos no se llama a ningún motor", async () => {
  const { c, llamadas } = motores({});
  assert.deepEqual(await moveAttachments([], c), []);
  assert.deepEqual(llamadas, []);
});

test("una imagen pegada que ya está en la VM no viaja otra vez; las de la Mac sí, y el orden se conserva", async () => {
  const { c, llamadas } = motores({ "/Users/alberto/b.png": { data_url: "data:image/png;base64,BBBB" } });
  const enLaVm = "/home/alberto/.terminus/attachments/y/pegada.png";
  const rutas = await attachmentsOn([enLaVm, "/Users/alberto/b.png"], (ruta) => ruta === enLaVm, c);
  assert.deepEqual(rutas, [enLaVm, "/home/alberto/.terminus/attachments/x/adjunto-0-b.png"]);
  assert.equal(llamadas.some((l) => l.includes(enLaVm)), false);
  assert.deepEqual(await attachmentsOn([enLaVm], () => true, c), [enLaVm]);
  assert.equal(llamadas.length, 3);
});
