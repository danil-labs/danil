/**
 * Lo que decide la vista de draw.io antes de pintar.
 *
 * El defecto que caza: un `</script>` dentro del XML o del visor cierra la
 * etiqueta que los contiene, y la vista queda en blanco sin un error.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { drawioAssets, drawioCompressed, drawioExpandedXml, drawioEditUrl, drawioMermaid, drawioScene, drawioXml } from "../../../../packages/features/chat/src/model/drawio.ts";

test("solo un XML o un Mermaid de verdad cuenta", () => {
  assert.equal(drawioXml({ xml: "<mxGraphModel/>" }), "<mxGraphModel/>");
  assert.equal(drawioXml({ xml: "   " }), null);
  assert.equal(drawioXml({}), null);
  assert.equal(drawioXml(null), null);
  assert.equal(drawioMermaid({ mermaid: "flowchart TD" }), "flowchart TD");
  assert.equal(drawioMermaid({ mermaid: "" }), null);
  assert.equal(drawioMermaid(undefined), null);
});

test("la dirección de edición lleva el XML entero y codificado", () => {
  const xml = '<mxGraphModel><mxCell value="a&b"/></mxGraphModel>';
  const url = drawioEditUrl(xml);
  assert.ok(url.startsWith("https://app.diagrams.net/"));
  assert.equal(new URL(url).hash, `#R${encodeURIComponent(xml)}`);
  assert.equal(decodeURIComponent(new URL(url).hash.slice(2)), xml);
});

test("un cierre de etiqueta ni en el XML ni en el visor rompe el documento", () => {
  const cierre = "</script>";
  const xml = `${cierre}<mxGraphModel/>`;
  const scene = drawioScene(`var GraphViewer={};/*${cierre}*/`, xml, [
    { kind: "shape", source: `/*${cierre}*/` },
    { kind: "stencil", source: `<shapes name="sample">${cierre}</shapes>` },
  ]);
  assert.equal((scene.match(/<\/script/gi) ?? []).length, 2, "solo cierran las dos etiquetas propias");
  assert.ok(scene.includes("<\\/script>"), "el cierre del visor viaja escapado");
  assert.ok(!scene.includes(`"${cierre}<mxGraphModel/>"`), "el XML no llega crudo al documento");
  assert.ok(scene.includes('id="g"'), "el contenedor del visor está");
  assert.ok(scene.includes("GraphViewer.processElements()"), "el visor se arranca");
  const literal = scene.match(/setAttribute\("data-mxgraph",(.+?)\);/)?.[1];
  assert.ok(literal, "el diagrama se le pasa al visor");
  // El atributo recibe texto: con un objeto literal el visor leería
  // «[object Object]» y la vista quedaría vacía, sin un error en consola.
  const config = JSON.parse(JSON.parse(literal));
  assert.equal(config.xml, xml);
  assert.equal(config.nav, true);
});


test("el icono indirecto carga su biblioteca local y nunca una ruta del XML", () => {
  const catalog = [
    { path: "stencils/aws4.xml", names: ["mxgraph.aws4"], kind: "stencil" as const },
    { path: "shapes/mxAWS4.js", names: ["mxgraph.aws4.resourceicon"], kind: "shape" as const },
    { path: "stencils/azure.xml", names: ["mxgraph.azure"], kind: "stencil" as const },
    { path: "stencils/../../secret.xml", names: ["mxgraph.aws4"], kind: "stencil" as const },
  ];
  assert.deepEqual(
    drawioAssets('shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;', catalog).map((asset) => asset.path),
    ["stencils/aws4.xml", "shapes/mxAWS4.js"],
  );
  assert.deepEqual(drawioAssets('image=https://elsewhere/secret.xml', catalog), []);
});


test("un mxfile comprimido se reconoce antes de mostrar una vista incompleta", () => {
  assert.equal(drawioCompressed('<mxfile><diagram id="p">jZDBCoMwDIafJjc9...</diagram></mxfile>'), true);
  assert.equal(drawioCompressed('<mxfile><diagram><mxGraphModel/></diagram></mxfile>'), false);
  assert.equal(drawioCompressed('<mxGraphModel><root/></mxGraphModel>'), false);
});


test("las páginas comprimidas resuelven las mismas bibliotecas que el XML abierto", async () => {
  const graph = '<mxGraphModel><root><mxCell style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;"/></root></mxGraphModel>';
  const data = deflateRawSync(encodeURIComponent(graph)).toString("base64");
  const expanded = await drawioExpandedXml(`<mxfile><diagram id="one">${data}</diagram><diagram id="two">${data}</diagram></mxfile>`);
  assert.equal(expanded, `<mxfile><diagram id="one">${graph}</diagram><diagram id="two">${graph}</diagram></mxfile>`);
  assert.equal(drawioCompressed(expanded), false);
  assert.deepEqual(drawioAssets(expanded, [
    { path: "stencils/aws4.xml", names: ["mxgraph.aws4"], kind: "stencil" },
  ]).map((asset) => asset.path), ["stencils/aws4.xml"]);
});
