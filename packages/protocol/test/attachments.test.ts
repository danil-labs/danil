import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENT_DOCUMENTS_FEATURE,
  attachmentAccept,
  acceptsDocuments,
  isImageMime,
  mimeOfAttachment,
} from "../src/index.ts";

test("un mime conocido se conserva y la extensión decide cuando llega vacío", () => {
  assert.equal(mimeOfAttachment("application/pdf", "informe.pdf"), "application/pdf");
  assert.equal(mimeOfAttachment("", "informe.pdf"), "application/pdf");
  assert.equal(mimeOfAttachment("application/octet-stream", "plan.DOCX"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(mimeOfAttachment("text/plain; charset=utf-8", "notas.txt"), "text/plain");
  assert.equal(mimeOfAttachment("application/x-msdownload", "setup.exe"), null);
  assert.equal(mimeOfAttachment("", "sin-extension"), null);
});

test("una imagen y un documento se distinguen, y el selector cambia con la máquina", () => {
  assert.equal(isImageMime("image/png"), true);
  assert.equal(isImageMime("application/pdf"), false);
  assert.equal(acceptsDocuments([ATTACHMENT_DOCUMENTS_FEATURE]), true);
  assert.equal(acceptsDocuments([]), false);
  assert.equal(acceptsDocuments(undefined), false);
  assert.match(attachmentAccept(true), /\.pdf/);
  assert.match(attachmentAccept(true), /application\/pdf/);
  assert.doesNotMatch(attachmentAccept(false), /\.pdf/);
  assert.match(attachmentAccept(false), /image\/png/);
});
