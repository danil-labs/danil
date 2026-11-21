export const MAX_LINES = 400;

export function r6(files) {
  const v = [];
  for (const f of files) {
    const n = f.text.split("\n").length - Number(f.text.endsWith("\n"));
    if (n > MAX_LINES) {
      const gen = /\/generated\//.test(f.path);
      v.push({ path: f.path, line: MAX_LINES + 1, reason: `R6: ${n} líneas (tope ${MAX_LINES})${gen ? "; el generador debe partir en archivos con índice" : ""}` });
    }
  }
  return v;
}
