/** Los mismos tramos y duraciones que astro-* en global.css; tiempo en ms, a 12 Hz. */
export function astroMotion(classes: string, time: number, style?: Record<string, string>) {
  const has = (name: string) => classes.split(" ").includes(name);
  const alternate = (duration: number) => { const p = time % (duration * 2) / duration; return p <= 1 ? p : 2 - p; };
  const origin = style?.["transform-origin"]?.match(/([\d.]+)px ([\d.]+)px/);
  const cx = origin ? Number(origin[1]) : 32;
  const cy = origin ? Number(origin[2]) : 32;
  if (has("astro-caida")) return { transform: `rotate(${Number.parseFloat(style?.["--astro-ang"] ?? "0")} 32 32)` };
  if (has("astro-particula")) {
    if (!time) return { opacity: 0 };
    const delay = Number.parseFloat(style?.["animation-delay"] ?? "0") * 1000;
    const p = ((time - delay) % 2500 + 2500) % 2500 / 2500;
    return { transform: `translate(${p * 13} 0)`, opacity: p < 0.2 ? p / 0.2 * 0.95 : p < 0.8 ? 0.95 - (p - 0.2) / 0.6 * 0.6 : 0.35 * (1 - p) / 0.2 };
  }
  if (!time) return {};
  if (has("astro-gira")) return { transform: `rotate(${time % 9000 / 9000 * 360} ${cx} ${cy})` };
  if (has("astro-corona")) return { transform: `rotate(${-time % 24000 / 24000 * 360} ${cx} ${cy})` };
  if (has("astro-columpio")) return { transform: `rotate(${-15 + alternate(2000) * 30} ${cx} ${cy})` };
  if (has("astro-estela")) { const p = alternate(1000); return { transform: `translate(${-p * 1.5} 0)`, opacity: 0.55 + p * 0.45 }; }
  if (has("astro-fotones")) { const p = alternate(1250); return { strokeWidth: 2.4 + p, opacity: 0.85 + p * 0.15 }; }
  if (has("astro-orejas")) { const p = alternate(500); return { transform: `rotate(${-8 + (has("astro-orejas-inv") ? 1 - p : p) * 16} ${cx} ${cy})` }; }
  if (has("astro-cola")) return { transform: `rotate(${-16 + alternate(500) * 30} ${cx} ${cy})` };
  if (has("astro-bigotes")) return { transform: `rotate(${-7 + alternate(500) * 14} ${cx} ${cy})` };
  return {};
}

export function astroBlink(time: number) {
  return time && time % 6000 >= 5750 && time % 6000 < 5833.3333 ? "translate(0 34) scale(1 0.08) translate(0 -34)" : undefined;
}
