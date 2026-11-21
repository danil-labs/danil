export const MAX_LINES = 400;

export function r6(files) {
  const v = [];
  for (const f of files) {
    // Un port mecánico de apps/desktop (cabecera `// port: apps/desktop/…`) conserva el tamaño del original:
    // partirlo obligaría a reescribirlo, que es justo lo que el portado prohíbe (gobernanza del harness, 2026-11-21).
    if (/^\/\/\s*port:\s*apps\/desktop\//.test(f.text)) continue;
    const n = f.text.split("\n").length - Number(f.text.endsWith("\n"));
    if (n > MAX_LINES) {
      const gen = /\/generated\//.test(f.path);
      v.push({ path: f.path, line: MAX_LINES + 1, reason: `R6: ${n} líneas (tope ${MAX_LINES})${gen ? "; el generador debe partir en archivos con índice" : ""}` });
    }
  }
  return v;
}
