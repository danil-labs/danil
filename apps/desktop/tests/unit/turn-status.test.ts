import assert from "node:assert/strict";
import test from "node:test";

// El catálogo primero: sin él, `t()` devuelve la clave y lo que se afirma
// abajo son rótulos en español.
import "../helpers/catalog.ts";
import { agrupar as groupSteps, cuentaDelTramo as segmentCount, enCurso as inProgress, pasoDe as stepOf, pasoDePermiso as permissionStep, pasoDeSistema as systemStep, resumen as summary, rotuloDeFila as rowLabel } from "../../src/lib/steps.ts";


test("cada herramienta en curso se nombra en presente y con su sujeto", () => {
  assert.deepEqual(inProgress(stepOf("Read", "src/features/chat/Chat.tsx")), {
    verbo: "Leyendo",
    sujeto: "Chat.tsx",
  });
  assert.deepEqual(inProgress(stepOf("Write", "src/lib/steps.ts")), {
    verbo: "Escribiendo",
    sujeto: "steps.ts",
  });
  assert.deepEqual(inProgress(stepOf("Edit", "src/lib/steps.ts")), {
    verbo: "Editando",
    sujeto: "steps.ts",
  });
  assert.deepEqual(inProgress(stepOf("Grep", "corriendo")), {
    verbo: "Buscando",
    sujeto: "corriendo",
  });
  assert.deepEqual(inProgress(stepOf("WebSearch", "mcp login")), {
    verbo: "Consultando la web",
    sujeto: "mcp login",
  });
  assert.deepEqual(inProgress(stepOf("TodoWrite", null)), {
    verbo: "Anotando el plan",
    sujeto: null,
  });
  // Una herramienta con dueño nombra al servicio y deja el nombre de la tool
  // legible: «Usando get file», no «Usando mcp__figma__get_file».
  assert.deepEqual(inProgress(stepOf("mcp__figma__get_file", "1234")), {
    verbo: "Usando get file",
    sujeto: "1234",
    origen: { server: "figma", tool: "get_file", mark: "figma", label: "Figma" },
  });
});

test("una fila de MCP ya cerrada lleva a su dueño y lee la tool sin identificador", () => {
  const [row] = groupSteps([stepOf("mcp__supabase__query", "orders")]);
  assert.deepEqual(summary(row), {
    verbo: "Usó query",
    sujeto: "orders",
    origen: { server: "supabase", tool: "query", mark: "supabase", label: "Supabase" },
  });
  // Un servidor que no está en la tabla conserva su clave: no se inventa marca.
  const [desconocido] = groupSteps([stepOf("mcp__acme-analytics__query", null)]);
  assert.deepEqual(summary(desconocido).origen, {
    server: "acme-analytics",
    tool: "query",
    mark: null,
    label: "acme-analytics",
  });
  // Lo local no tiene dueño.
  assert.equal(summary(groupSteps([stepOf("Read", "a.ts")])[0]).origen, undefined);
});

test("un comando en curso se enseña sin su envoltorio y en una línea", () => {
  assert.deepEqual(inProgress(stepOf("Bash", '/bin/zsh -lc "pnpm verify\nls"')), {
    verbo: "Ejecutando",
    sujeto: "pnpm verify",
  });
});

test("un comando se nombra por su programa y su primer tramo, no por el intérprete", () => {
  const [row] = groupSteps([stepOf("Bash", "/bin/bash -lc 'cd /repo && pnpm verify'")]);
  assert.equal(summary(row).sujeto, "pnpm verify");
  const [wrapped] = groupSteps([stepOf("Bash", "env FOO=1 sudo -u root timeout 30 systemctl restart x")]);
  assert.equal(summary(wrapped).sujeto, "systemctl restart x");
  // Lo que ya era un comando no se toca, y el desplegado conserva todo.
  const [plain] = groupSteps([stepOf("Bash", "pnpm verify 2>&1 | tail -20")]);
  assert.equal(summary(plain).sujeto, "pnpm verify");
});

test("la cabecera de un tramo cuenta por clase, y las ediciones por archivo", () => {
  const segment = [
    stepOf("Read", "a.ts"),
    stepOf("Read", "b.ts"),
    stepOf("Edit", "a.ts"),
    stepOf("Edit", "a.ts"),
    stepOf("Write", "c.ts"),
    stepOf("Bash", "pnpm verify"),
    permissionStep("Bash", "rm -rf dist", false),
  ];
  assert.equal(
    segmentCount(segment),
    "Leyó 2 archivos, editó 2 archivos, ejecutó 1 comando, 1 permiso denegado",
  );
  // La fila agrupada y la cabecera dicen la misma cifra: si no, el tramo
  // pliega «editó 2» y desplegado enseña «Cambió 3».
  const [edit] = groupSteps(segment.slice(2, 5));
  assert.equal(summary(edit).verbo, "Cambió 2 archivos");
  assert.equal(segmentCount([systemStep("aviso", "Se guardó el árbol.")]), null);
});

// El tramo vivo no ha terminado nada: en pasado, su cabecera afirma lo contrario
// mientras el loader dice que sigue.
test("un tramo vivo se cuenta en gerundio, y su fila en curso también", () => {
  const segment = [
    stepOf("Edit", "a.ts"),
    stepOf("Write", "c.ts"),
    { ...stepOf("Bash", "pnpm verify"), corriendo: true },
  ];
  assert.equal(segmentCount(segment, true), "Editando 2 archivos, ejecutando 1 comando");
  assert.equal(segmentCount(segment), "Editó 2 archivos, ejecutó 1 comando");
  const rows = groupSteps(segment);
  assert.equal(rowLabel(rows.at(-1)!).verbo, "Ejecutando");
  assert.equal(rowLabel(rows[0]).verbo, "Cambió 2 archivos");
});
