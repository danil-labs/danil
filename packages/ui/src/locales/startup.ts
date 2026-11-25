/** El lanzador libera las lecturas del motor: un catálogo no puede impedir que se monte. */
export async function mountAfterLanguagePacks(packs: Promise<unknown>, mount: () => void, waitMs = 1000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([packs, new Promise<void>((done) => { timer = setTimeout(done, waitMs); })]);
  } catch {
    // La lengua de respaldo ya está registrada; la lectura tardía sigue por detrás.
  } finally {
    clearTimeout(timer);
  }
  mount();
}
