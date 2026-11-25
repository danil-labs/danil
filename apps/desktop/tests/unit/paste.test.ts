import assert from "node:assert/strict";
import test from "node:test";

/**
 * **El hilo que sigue al fondo, en lo que se rompe callado.**
 *
 * Ninguno de estos fallos da un error: el chat sigue pintándose entero y lo que
 * se ve es «el scroll está raro», que es una frase que no lleva a ningún sitio.
 * Por eso cada prueba de aquí nombra el síntoma que vería quien opera, no el
 * estado interno.
 *
 * **Se prueba el autómata, no el navegador.** El elemento es falso, el reloj de
 * cuadros lo lleva la prueba y el `ResizeObserver` lo dispara ella. Lo que un
 * navegador aporta —el alto de verdad, la rueda, el redondeo de `scrollTop`— no
 * se puede simular aquí y no se pretende: lo que se afirma es cuándo el hilo
 * decide seguir y cuándo decide soltarse, que es donde estaban los cuatro
 * defectos.
 *
 * **Los eventos de `scroll` se emiten de forma asíncrona a propósito.** Los
 * navegadores no los entregan durante la asignación a `scrollTop`, y de eso
 * depende una pieza del módulo: la escritura apunta su valor *después* de mover
 * la barra, así que un evento síncrono llegaría con el valor anterior y la
 * animación se leería a sí misma como un gesto de la persona. Emitirlos síncronos
 * aquí haría pasar una prueba que en el webview falla.
 */

// ── El entorno mínimo que el módulo toca ────────────────────────────────────

const cuadrosPendientes: Array<(t: number) => void> = [];

const g = globalThis as Record<string, unknown>;
g.document = { addEventListener: () => {} };
g.window = { getSelection: () => null };
g.getComputedStyle = () => ({ overflow: "auto", scrollBehavior: "auto" });
g.requestAnimationFrame = (cb: (t: number) => void) => cuadrosPendientes.push(cb);

/**
 * El observador de tamaño, con el disparo en la mano de la prueba.
 *
 * **Lleva la cuenta de a cuántos contenidos mira, y no es un detalle del
 * andamio.** El módulo lee `entradas[0]`, así que un observador que se quedara
 * mirando también al contenido de la conversación anterior le entregaría la
 * medida del elemento equivocado. Modelar eso es lo único que puede afirmar que
 * el `ref` suelta lo anterior antes de tomar lo nuevo.
 */
const alturas = new Map<object, number>();
let disparar: ((el: object, alto: number) => void) | undefined;
g.ResizeObserver = class {
  cb: (e: Array<{ contentRect: { height: number } }>) => void;
  // Por instancia y no global: cada hilo tiene su observador, y compartir la
  // lista haría que el resultado de una prueba dependiera de las que corrieron
  // antes.
  observados: object[] = [];
  constructor(cb: (e: Array<{ contentRect: { height: number } }>) => void) {
    this.cb = cb;
  }
  observe(el: object) {
    this.observados.push(el);
    disparar = (quien: object, alto: number) => {
      alturas.set(quien, alto);
      this.cb(this.observados.map((e) => ({ contentRect: { height: alturas.get(e) ?? 0 } })));
    };
  }
  disconnect() {
    this.observados = [];
  }
};

const { createRoot, createSignal } = await import("solid-js");
const { seguirElFondo } = await import("../../../../packages/features/chat/src/model/paste.ts");

/**
 * Un contenedor que scrollea, sin navegador debajo.
 *
 * `scrollTop` se acota como lo acota el DOM —nunca por debajo de cero ni por
 * encima de lo que hay que recorrer— porque media lógica del módulo depende de
 * esa saturación: sin ella, el muelle «llega» a una posición que en la pantalla
 * no existe.
 */
function contenedorFalso(alto: number, contenido: number) {
  const oyentes = new Map<string, Array<(e: unknown) => void>>();
  let top = 0;
  const el = {
    clientHeight: alto,
    scrollHeight: contenido,
    // El borde de arriba de la caja, en coordenadas de la ventana. Cero
    // simplifica las cuentas y no le quita nada a lo que se afirma: el módulo
    // solo usa diferencias contra este valor.
    getBoundingClientRect: () => ({ top: 0, bottom: alto }),
    style: {} as Record<string, string>,
    parentElement: null,
    contains: () => false,
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      const tope = Math.max(0, el.scrollHeight - el.clientHeight);
      const antes = top;
      // Cuantizado a 1/64 de píxel, que es la `LayoutUnit` de Blink. Guardar el
      // flotante entero dejaría al muelle acercándose para siempre en pasos de
      // una diezmilésima: en un navegador esos pasos se redondean a cero, y de
      // ahí sale el acumulador del módulo. Sin cuantizar, la prueba mediría una
      // convergencia que ninguna pantalla tiene.
      top = Math.round(Math.min(Math.max(0, v), tope) * 64) / 64;
      // Asíncrono, como los de verdad. Ver la cabecera.
      if (top !== antes) queueMicrotask(() => emitir("scroll", { target: el }));
    },
    addEventListener: (n: string, f: (e: unknown) => void) =>
      void oyentes.set(n, [...(oyentes.get(n) ?? []), f]),
    removeEventListener: () => {},
  };
  const emitir = (n: string, e: unknown) => oyentes.get(n)?.forEach((f) => f(e));
  return { el, emitir };
}

/**
 * El contenido con hijos, que es lo que el ancla de lectura necesita.
 *
 * **Sin esto no se puede afirmar nada del ancla**: el andamio modelaba el
 * contenido como un objeto vacío, así que un módulo que buscara «el primer hijo
 * que asoma por el borde» no encontraba ninguno y la prueba pasaba sin probar.
 *
 * La geometría es la mínima que hace falta: los hijos van uno detrás de otro
 * desde el principio del contenido, y su posición en la ventana es su offset
 * menos lo que la barra lleva recorrido. Es exactamente la cuenta que hace un
 * navegador, y es la que el ancla deshace.
 */
function contenidoFalso(caja: { scrollTop: number }, alturas: number[]) {
  const hijos = alturas.map((_, i) => ({
    isConnected: true,
    getBoundingClientRect() {
      const inicio = alturas.slice(0, i).reduce((a, b) => a + b, 0);
      return { top: inicio - caja.scrollTop, bottom: inicio + alturas[i]! - caja.scrollTop };
    },
  }));
  return {
    children: Object.assign(hijos, { length: hijos.length }),
    /** Crece el hijo `i`, como crecería un bloque que se despliega. */
    crecer: (i: number, px: number) => void (alturas[i] += px),
  };
}

/** Un tic del reloj: corre los cuadros encolados y deja correr los `setTimeout`. */
async function cuadro() {
  const lote = cuadrosPendientes.splice(0);
  for (const cb of lote) cb(performance.now());
  // 5 ms porque el módulo usa `setTimeout(…, 1)` para dejar pasar el evento de
  // `scroll` que sigue a un cambio de tamaño.
  await new Promise((r) => setTimeout(r, 5));
}

const cuadros = async (n: number) => {
  for (let i = 0; i < n; i++) await cuadro();
};

/** Corre cuadros hasta que se cumpla algo, con tope. Devuelve si se cumplió. */
async function cuadrosHasta(cumple: () => boolean, tope: number) {
  for (let i = 0; i < tope; i++) {
    if (cumple()) return true;
    await cuadro();
  }
  return cumple();
}

/**
 * Un hilo montado y listo, con el contenido ya medido una vez.
 *
 * Esa primera medición no es decorado: el módulo trata el primer aviso del
 * observador como la apertura y baja de un corte, así que sin ella toda prueba
 * estaría midiendo la apertura en vez de lo que quiere medir.
 */
async function hilo(opciones: { alto: number; contenido: number }) {
  const { el, emitir } = contenedorFalso(opciones.alto, opciones.contenido);
  const p = createRoot(() => seguirElFondo());
  const dentro = { style: {} };
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(dentro as HTMLElement);
  disparar!(dentro, opciones.contenido);
  // Dónde quedó la barra **sin haber corrido un solo cuadro**. Es lo que ve la
  // pantalla en el primer pintado; ver la prueba de la apertura.
  const antesDelPrimerCuadro = el.scrollTop;
  await cuadros(3);
  /** Hace crecer el contenido y avisa, como haría el navegador. */
  const crecer = async (px: number, n = 3) => {
    el.scrollHeight += px;
    disparar!(dentro, el.scrollHeight);
    await cuadros(n);
  };
  /** Mueve la barra como la movería la persona. */
  const arrastrar = async (a: number) => {
    el.scrollTop = a;
    await cuadros(1);
  };
  const rueda = async (deltaY: number) => {
    emitir("wheel", { target: el, deltaY });
    await cuadros(1);
  };
  const fondo = () => el.scrollHeight - el.clientHeight;
  /**
   * Cuánto le falta al hilo para estar en el final.
   *
   * **Nunca es cero, y eso es el diseño.** El módulo apunta a
   * `scrollHeight - 1 - clientHeight`: ese píxel es lo que hace que la cuenta
   * funcione dentro de un contenedor con `zoom`, donde el fondo de verdad es
   * fraccionario y `scrollTop` no puede valerlo. Afirmar la igualdad exacta
   * sería afirmar justo lo que el módulo evita a propósito.
   */
  const falta = () => fondo() - el.scrollTop;
  return { p, el, dentro, crecer, arrastrar, rueda, fondo, falta, antesDelPrimerCuadro };
}

/**
 * «Está en el final», con lo que el módulo se reserva.
 *
 * Un píxel es el de [`fondo`] —el que hace que la cuenta cierre bajo `zoom`— y
 * la fracción que sobra es el último paso del muelle, que se apaga cuando lo que
 * le queda por mover ya no llega a un 1/64 de píxel. Exigir cero exacto sería
 * exigir que el muelle terminara en un tiempo que la física no le da.
 */
const HOLGURA = 26;

function enElFinal(falta: number, nota = "el hilo tenía que estar en el final") {
  assert.ok(
    falta <= HOLGURA + 1.5,
    `${nota}; se quedó a ${falta}px (el destino son ${HOLGURA}px por encima del máximo)`,
  );
}

// ── Lo que tiene que pasar ──────────────────────────────────────────────────

test("y la coloca sin gastar un cuadro, que es lo que se veía parpadear", async () => {
  // Al cambiar de chat se ve un parpadeo: el scroll se mueve. Con el salto
  // dentro de un `requestAnimationFrame`, entre
  // que el hilo entra en el DOM y que ese cuadro corre, el navegador pinta una
  // vez con la conversación arriba. Afirmar el final **después** de dejar correr
  // el reloj no lo habría cazado nunca: llega bien, un cuadro tarde.
  const h = await hilo({ alto: 400, contenido: 2000 });
  const fondo = 2000 - 400;
  assert.ok(
    fondo - h.antesDelPrimerCuadro <= HOLGURA + 1.5,
    `el primer pintado tenía que salir colocado; salió a ${h.antesDelPrimerCuadro} de ${fondo}`,
  );
});

test("volver a una conversación más larga también coloca en el primer cuadro", async () => {
  // El mismo salto por la otra puerta: aquí no hay observador estrenándose, lo
  // pide `Chat.tsx` cuando cambia `conversacion`.
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.arrastrar(0);
  h.el.scrollHeight = 6000;
  h.p.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true });
  assert.ok(
    6000 - 400 - h.el.scrollTop <= HOLGURA + 1.5,
    `tenía que colocar ya; quedó en ${h.el.scrollTop}`,
  );
});

test("lo que crece SIN ser un mensaje también lo arrastra", async () => {
  // Es el defecto 3: desplegar el registro de un turno, un diff que aparece, una
  // miniatura que carga. Nada de eso toca `msgs`, y el efecto de antes solo
  // miraba `msgs`. Aquí no hay mensajes: solo contenido que creció.
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.crecer(50);
  await h.crecer(50);
  enElFinal(h.falta());
});

test("la rueda hacia abajo no suelta nada", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.rueda(120);
  await h.crecer(600);
  enElFinal(h.falta());
});

test("pedir bajar vuelve a engancharlo", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.arrastrar(200);
  await h.crecer(600);
  assert.ok(h.falta() > HOLGURA + 1.5, "primero se suelta");

  h.p.bajar({ animacion: "instantanea" });
  await cuadros(3);
  enElFinal(h.falta());

  await h.crecer(300);
  enElFinal(h.falta(), "y sigue enganchado después");
});

test("volver al final a mano lo re-engancha, sin pedirlo", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.arrastrar(200);
  await h.arrastrar(h.fondo());
  await h.crecer(400);
  enElFinal(h.falta());
});

test("el botón de bajar solo se ofrece cuando el final no se ve", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  assert.equal(h.p.alFondo(), true, "al final no hay nada que ofrecer");

  await h.arrastrar(200);
  assert.equal(h.p.alFondo(), false, "arriba sí");

  // Y a veinte píxeles del final tampoco: un control que aparece por eso
  // parpadea con cada gesto.
  await h.arrastrar(h.fondo() - 20);
  assert.equal(h.p.alFondo(), true);
});

test("la bajada que se pide no se suelta a sí misma", async () => {
  // El muelle mueve la barra, y cada movimiento emite un `scroll`. Si esos
  // eventos contaran como gestos, el hilo se soltaría en el primer cuadro de su
  // propia bajada y no volvería a seguir a nadie.
  //
  // **Se prueba sobre `bajar` y no sobre el crecimiento, y eso es el cambio.**
  // Seguir al contenido que crece ya no anima —se pega de un corte dentro del
  // observador—, así que ahí no queda animación que pudiera auto-soltarse. El
  // muelle sigue vivo donde el movimiento dice algo: el botón de bajar y mandar
  // un mensaje.
  const h = await hilo({ alto: 400, contenido: 4000 });
  await h.arrastrar(0);
  assert.equal(h.p.alFondo(), false, "primero, lejos del final");

  h.p.bajar();
  await cuadro();
  assert.ok(h.falta() > HOLGURA + 1.5, "el muelle todavía va por el camino");
  assert.equal(h.p.alFondo(), true, "y sigue siguiendo mientras lo recorre");
  const llego = await cuadrosHasta(() => h.falta() <= HOLGURA + 1.5, 300);
  assert.ok(llego, `el muelle no llegó; se quedó a ${h.falta()}px`);
});

test("una línea que se re-envuelve NO mueve la barra", async () => {
  // El invariante del que cuelga todo lo demás, y el que faltaba. El markdown
  // del último bloque se re-parsea con cada token y su alto **no crece de forma
  // monótona**: `**neg` se pinta literal y `**negrita**` en negrita, así que una
  // línea envuelta deja de estarlo y el bloque pierde 22 px. Pegado al máximo,
  // eso es el navegador acotando la barra hacia arriba: el temblor.
  //
  // Con la holgura, el máximo baja y la barra no lo alcanza: no se mueve nada.
  // `ui/MonotonicHeight.tsx` ataca el mismo defecto por el otro lado —que el bloque
  // no encoja— y son a propósito las dos: esta no depende de que el contenido se
  // porte bien.
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.crecer(60);
  const donde = h.el.scrollTop;

  h.el.scrollHeight -= 22;
  disparar!(h.dentro, h.el.scrollHeight);
  await cuadros(3);
  assert.equal(h.el.scrollTop, donde, "el re-envuelto no puede mover la barra");

  // Y en cuanto vuelve a crecer, sigue siguiendo.
  await h.crecer(22);
  enElFinal(h.falta(), "y sigue enganchado después");
});

test("encoger hasta que el final se vea vuelve a engancharlo", async () => {
  // Plegar el registro de un turno largo estando suelto justo encima del final:
  // el fondo viene a buscarte, y quedarse suelto ahí es quedarse suelto mirando
  // el final.
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.arrastrar(1000);
  h.el.scrollHeight = 1450;
  disparar!(h.dentro, 1450);
  await cuadros(3);
  assert.equal(h.p.alFondo(), true);

  await h.crecer(500);
  enElFinal(h.falta());
});

test("un hilo más corto que su hueco no se mueve ni se cuelga", async () => {
  const h = await hilo({ alto: 400, contenido: 100 });
  await h.crecer(50);
  assert.equal(h.el.scrollTop, 0);
  assert.equal(h.p.alFondo(), true);
});

test("volver a una conversación después de una vacía sigue siguiendo", async () => {
  // La caja de una tarea nueva se pinta centrada y **sin contenedor de scroll**,
  // así que ir a una tarea vacía y volver monta elementos distintos.
  //
  // Lo que esto fija es que el contenido nuevo cuente como una apertura. Sin
  // olvidar el alto del anterior, una conversación **más corta** que la que se
  // dejó mide una diferencia negativa, el observador la trata como que el hilo
  // encogió, y la tarea abre a media altura. Que sea más corta que la primera no
  // es decorado: es la condición del defecto.
  const h = await hilo({ alto: 400, contenido: 2000 });

  const { el: otro } = contenedorFalso(400, 1000);
  const otroDentro = {};
  h.p.contenedor(otro as unknown as HTMLElement);
  h.p.contenido(otroDentro as HTMLElement);
  disparar!(otroDentro, 1000);
  await cuadros(3);
  assert.ok(
    otro.scrollHeight - otro.clientHeight - otro.scrollTop <= HOLGURA + 1.5,
    "abre en el final",
  );

  otro.scrollHeight += 700;
  disparar!(otroDentro, otro.scrollHeight);
  await cuadros(3);
  enElFinal(otro.scrollHeight - otro.clientHeight - otro.scrollTop);
});

test("subir a releer suelta el hilo AUNQUE esté entrando texto", async () => {
  // El defecto 2 de la cabecera del módulo, y el que más se notaba con un turno
  // largo: `alScrollear` descartaba el evento entero mientras el contenido
  // cambiara de alto —o sea, casi siempre—, así que arrastrar la barra, el
  // trackpad y las teclas **no soltaban nada** y el delta siguiente devolvía
  // abajo. Se salvaba solo la rueda, que tiene manejador propio.
  //
  // Aquí no se toca la rueda a propósito: lo que se afirma es que un gesto que
  // llega solo como un evento de `scroll` cuenta.
  const h = await hilo({ alto: 400, contenido: 2000 });
  h.el.scrollHeight += 300;
  disparar!(h.dentro, h.el.scrollHeight);
  h.el.scrollTop = h.el.scrollTop - 200;
  await cuadros(3);

  assert.equal(h.p.alFondo(), false, "el gesto tenía que soltar el hilo");
  const donde = h.el.scrollTop;
  await h.crecer(600);
  assert.equal(h.el.scrollTop, donde, "y lo que entra después no lo mueve");
});

test("lo que entra con alguien leyendo arriba se anuncia, y el aviso se apaga al bajar", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.rueda(-1);
  assert.equal(h.p.hayNuevos(), false, "soltarse no es una novedad");

  await h.crecer(600);
  assert.equal(h.p.hayNuevos(), true, "entró algo que no se está viendo");

  h.p.bajar({ animacion: "instantanea" });
  await cuadros(3);
  assert.equal(h.p.hayNuevos(), false, "y se apaga al ir a verlo");
});

test("anteponer historia con alguien leyendo arriba no mueve lo que lee", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  await h.rueda(-1);
  await h.arrastrar(100);
  h.p.anteponer(() => {
    h.el.scrollHeight += 3000;
  });
  assert.equal(h.el.scrollTop, 3100, "se corrige en el mismo gesto, antes del primer cuadro");
  disparar!(h.dentro, h.el.scrollHeight);
  await cuadros(3);
  assert.equal(h.el.scrollTop, 3100, "y la medida que llega después no lo corrige dos veces");
  assert.equal(h.p.hayNuevos(), false, "historia vieja no es un mensaje nuevo");
});

test("anteponer siguiendo al fondo deja el hilo en el final", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  h.p.anteponer(() => {
    h.el.scrollHeight += 3000;
  });
  disparar!(h.dentro, h.el.scrollHeight);
  await cuadros(3);
  enElFinal(h.falta());
});

test("recolocar convierte la próxima medida en una apertura", async () => {
  // Cambiar de conversación no cambia el elemento —la caja del chat es la misma
  // instancia—, así que sin esto el observador mide el hilo nuevo contra el alto
  // del anterior y el muelle recorre la diferencia **a la vista**. Es el brinco
  // de apertura, y el mismo que se veía al elegir ventana con la pantalla
  // partida.
  const conRecolocar = await hilo({ alto: 400, contenido: 2000 });
  conRecolocar.p.recolocar();
  conRecolocar.el.scrollHeight = 6000;
  disparar!(conRecolocar.dentro, 6000);
  assert.ok(
    6000 - 400 - conRecolocar.el.scrollTop <= HOLGURA + 1.5,
    `tenía que colocar sin gastar un cuadro; quedó en ${conRecolocar.el.scrollTop}`,
  );

  // El control negativo, y es el defecto que se midió: una conversación **más
  // corta** que la anterior mide una diferencia negativa, el observador la trata
  // como que el hilo encogió y la tarea abre a media altura. Que sea más corta
  // no es decorado: es la condición.
  const sinRecolocar = await hilo({ alto: 400, contenido: 6000 });
  await sinRecolocar.arrastrar(0);
  sinRecolocar.el.scrollHeight = 2000;
  disparar!(sinRecolocar.dentro, 2000);
  await cuadros(3);
  assert.ok(
    2000 - 400 - sinRecolocar.el.scrollTop > HOLGURA + 1.5,
    "sin recolocar tenía que abrir por donde estaba",
  );
});

test("lo que crece POR ENCIMA no se lleva la lectura por delante", async () => {
  // El hilo brinca con cada mensaje nuevo, como si peleara por bajar y luego
  // regresara. No es el seguimiento —ese no toca nada estando suelto—: es que
  // el navegador conserva la distancia al
  // **principio** del contenido y no a lo que estás mirando. Un registro de
  // ejecución que crece mientras el turno corre, o que se pliega al cerrarse, se
  // lleva el texto por delante sin que nadie mueva la barra.
  //
  // `overflow-anchor` haría esto solo, y **no existe en WebKit**.
  const { el, emitir: _e } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  // Diez bloques de 200 px: el hilo entero.
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Alguien se sube a releer: queda mirando el bloque 3 desde su principio.
  el.scrollTop = 600;
  await cuadros(1);
  assert.equal(p.alFondo(), false, "primero, suelto");

  // Y el bloque 1 —muy por encima— crece 150 px, como el registro de un turno.
  c.crecer(1, 150);
  el.scrollHeight += 150;
  disparar!(c, el.scrollHeight);
  await cuadros(3);

  assert.equal(
    el.scrollTop,
    750,
    "la barra tenía que bajar los mismos 150 px para que el texto no se moviera",
  );
});

test("y lo que ENCOGE por encima tampoco", async () => {
  // La otra puerta, y la que más se nota: el registro se pliega en «Trabajó
  // durante N» al cerrarse el turno y se lleva cientos de píxeles de golpe.
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  el.scrollTop = 600;
  await cuadros(1);

  c.crecer(1, -150);
  el.scrollHeight -= 150;
  disparar!(c, el.scrollHeight);
  await cuadros(3);

  assert.equal(el.scrollTop, 450, "la barra tenía que subir los mismos 150 px");
});


test("bajar a mano mientras la respuesta crece no rebota a donde estabas", async () => {
  // El síntoma: estando suelto, la barra vuelve sola al sitio anterior en
  // cuanto entra texto. Fija que el gesto hacia abajo mueve el ancla.
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  el.scrollTop = 600;
  await cuadros(1);
  assert.equal(p.alFondo(), false, "primero, suelto");

  // Y desde ahí baja un poco a mano, sin llegar al final.
  el.scrollTop = 800;
  await cuadros(1);

  // Crece el último bloque, que es lo que hace el texto que va llegando.
  c.crecer(9, 120);
  el.scrollHeight += 120;
  disparar!(c, el.scrollHeight);
  await cuadros(3);

  assert.equal(el.scrollTop, 800, "la barra tenía que quedarse donde la persona la dejó");
});

test("agrandar la ventana conserva el seguimiento tras acotar el scroll", async () => {
  const h = await hilo({ alto: 400, contenido: 2000 });
  h.el.clientHeight = 700;
  h.el.scrollTop = h.el.scrollTop;
  await cuadros(3);
  await h.crecer(300);
  enElFinal(h.falta());
});

/** Un hilo que sigue el fondo sobre quince bloques, con el turno en la mano de la prueba. */
async function hiloConTurno() {
  const { el } = contenedorFalso(600, 3000);
  const { p, ponTurno } = createRoot(() => {
    const [enTurno, ponTurno] = createSignal(true);
    return { p: seguirElFondo(enTurno), ponTurno };
  });
  const c = Object.assign(contenidoFalso(el, Array(15).fill(200)), { style: {} as Record<string, string> });
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 3000);
  await cuadros(3);
  /** El último bloque encoge, como el registro que se pliega. */
  const encoger = async (px: number) => {
    c.crecer(14, -px);
    el.scrollHeight -= px;
    disparar!(c, el.scrollHeight);
    await cuadros(3);
  };
  /** Cierra el turno sin que el contenido cambie de alto. */
  const cerrarTurno = async () => {
    ponTurno(false);
    await cuadros(3);
  };
  return { el, p, c, encoger, cerrarTurno };
}

// El registro del turno se pliega al recargarse ya cerrado: nada llega después a ocupar lo encogido.
test("lo que encoge con el turno cerrado no deja blanco bajo el último renglón", async () => {
  const h = await hiloConTurno();
  await h.cerrarTurno();
  await h.encoger(500);
  assert.equal(h.c.style.paddingBottom ?? "", "", "el blanco bajo el último renglón se quedó puesto");
  assert.equal(h.p.alFondo(), true);
});

test("el relleno de un turno se suelta al cerrarlo", async () => {
  const h = await hiloConTurno();
  await h.encoger(150);
  assert.equal(h.c.style.paddingBottom, "150px", "en vuelo, lo que encoge se devuelve como relleno");
  await h.cerrarTurno();
  assert.equal(h.c.style.paddingBottom ?? "", "", "el relleno del turno siguió puesto después de cerrarlo");
  assert.equal(h.p.alFondo(), true);
});

test("subir con la rueda estando ya suelto no se atora ni rebota al punto anterior", async () => {
  // Síntoma: al subir con rueda en un hilo largo, `alRodar` re-tomaba el ancla ANTES
  // de que el navegador aplicara el desplazamiento y `sostener()` o el observador
  // devolvían `scrollTop` hacia abajo en cada paso.
  const { el, emitir } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Suelto a media conversación.
  el.scrollTop = 900;
  await cuadros(1);
  assert.equal(p.alFondo(), false);

  // Rueda hacia arriba -> el navegador aplica el paso -> `sostener()` y el observador corren.
  emitir("wheel", { target: el, deltaY: -120 });
  el.scrollTop = 780;
  // Antes de que llegue el microtask de `scroll`, un `sostener()` no puede deshacer la rueda.
  p.sostener();
  assert.equal(el.scrollTop, 780, "sostener en vuelo no debe regresar la barra hacia abajo");
  await cuadros(1);

  // Segundo paso de rueda hacia arriba con cambio de tamaño en medio.
  emitir("wheel", { target: el, deltaY: -120 });
  el.scrollTop = 660;
  c.crecer(9, 40);
  el.scrollHeight += 40;
  disparar!(c, el.scrollHeight);
  await cuadros(2);
  assert.equal(el.scrollTop, 660, "la rueda continua hacia arriba no debe atorarse");
});

test("subir pocos píxeles cerca del final suelta y un encogimiento inmediato no vuelve a enganchar", async () => {
  const { el, emitir } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Subir 30 px desde el fondo (todavía dentro de MARGEN_DE_FONDO = 70 px).
  emitir("wheel", { target: el, deltaY: -30 });
  el.scrollTop = el.scrollTop - 30;
  await cuadros(1);

  // Un encogimiento mientras la persona acaba de rodar hacia arriba no la vuelve a pegar.
  c.crecer(9, -20);
  el.scrollHeight -= 20;
  disparar!(c, el.scrollHeight);
  await cuadros(2);

  // Al crecer el hilo después, sigue suelto en vez de arrastrar hacia el fondo.
  const donde = el.scrollTop;
  c.crecer(9, 400);
  el.scrollHeight += 400;
  disparar!(c, el.scrollHeight);
  await cuadros(2);
  assert.equal(el.scrollTop, donde, "debe seguir suelto tras subir cerca del final");
});

test("sostener actualiza el ancla tras compensar un cambio por encima", async () => {
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  el.scrollTop = 600;
  await cuadros(1);

  // Crece por encima (como una fila recién medida en VirtualThread) y `sostener()` corrige.
  c.crecer(1, 140);
  el.scrollHeight += 140;
  p.sostener();
  assert.equal(el.scrollTop, 740);
  await cuadros(1);

  // El ResizeObserver que llega después no vuelve a sumar 140 px.
  disparar!(c, el.scrollHeight);
  await cuadros(2);
  assert.equal(el.scrollTop, 740, "el observador no debe corregir dos veces tras sostener()");
});

test("crecer por encima durante una rueda hacia arriba compensa el salto en vez de llevar la vista arriba", async () => {
  // Síntoma: `ruedaPendiente` saltaba `restaurarAncla()` durante una rueda hacia arriba;
  // si en esa ventana se montaban o crecían filas por encima, `scrollTop` no compensaba
  // y la vista saltaba de golpe hacia arriba en el hilo.
  const { el, emitir } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Suelto leyendo el bloque 4 (inicia en y=800, asomando en top=-100).
  el.scrollTop = 900;
  await cuadros(1);

  // Rueda hacia arriba (-120 px) mientras una fila por encima crece +300 px antes del evento `scroll`.
  emitir("wheel", { target: el, deltaY: -120 });
  el.scrollTop = 780;
  c.crecer(1, 300);
  el.scrollHeight += 300;
  p.sostener();

  // Debe preservar el paso de rueda (-120) Y compensar el crecimiento arriba (+300): 780 + 300 = 1080.
  assert.equal(el.scrollTop, 1080, "debe compensar el crecimiento arriba sin perder el paso de rueda");
  assert.equal(c.children[4]!.getBoundingClientRect().top, 20, "el bloque leído solo bajó los 120 px de la rueda");

  // El ResizeObserver posterior no debe volver a compensar.
  disparar!(c, el.scrollHeight);
  await cuadros(2);
  assert.equal(el.scrollTop, 1080, "el observador posterior no debe duplicar la compensación");
});

test("scrollear hacia arriba sin rueda (inercia o barra) no se revierte ni pierde compensación por encima", async () => {
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  el.scrollTop = 900;
  await cuadros(1);

  // Scroll hacia arriba sin `wheel` (inercia / barra / teclado), antes de que llegue el evento `scroll`.
  el.scrollTop = 700;
  p.sostener();
  assert.equal(el.scrollTop, 700, "sostener sin cambios de layout no debe revertir el scroll");

  // Sigue subiendo y simultáneamente crece un bloque arriba +250 px.
  el.scrollTop = 500;
  c.crecer(0, 250);
  el.scrollHeight += 250;
  p.sostener();
  assert.equal(el.scrollTop, 750, "debe sumar solo el delta de contenido arriba (+250) sobre el scroll actual");
  await cuadros(2);
  assert.equal(el.scrollTop, 750);
});

test("no ancla a un hijo fuera de pantalla debajo de la vista al subir rápido dentro de margen virtual", async () => {
  // Simula `VirtualThread`: el primer hijo montado tiene un `margin-top` virtual de 2000 px.
  const { el } = contenedorFalso(400, 4000);
  const p = createRoot(() => seguirElFondo());
  let margenSuperior = 2000;
  const hijos = [0, 1, 2].map((i) => ({
    isConnected: true,
    getBoundingClientRect() {
      const inicio = margenSuperior + i * 200;
      return { top: inicio - el.scrollTop, bottom: inicio + 200 - el.scrollTop };
    },
  }));
  const c = { children: Object.assign(hijos, { length: hijos.length }) };
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 4000);
  await cuadros(3);

  // Suelto viendo los hijos montados.
  el.scrollTop = 2100;
  await cuadros(1);

  // Subida rápida dentro del margen virtual aún sin montar: el primer hijo queda en top=1500 >= 400.
  el.scrollTop = 500;
  await cuadros(1);

  // El margen virtual encoge -1000 px al reemplazarse por filas más cortas que lo estimado.
  margenSuperior = 1000;
  p.sostener();
  assert.equal(el.scrollTop, 500, "no debe arrastrar `scrollTop` a 0 por un hijo que estaba fuera de pantalla");
});

test("anteponer filas virtuales con alto real mayor al estimado conserva la lectura exacta", async () => {
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const bloqueAlturas = Array(10).fill(200);
  let margenSuperior = 0;
  const makeChild = (idx: () => number) => ({
    isConnected: true,
    getBoundingClientRect() {
      const i = idx();
      const inicio = margenSuperior + bloqueAlturas.slice(0, i).reduce((a, b) => a + b, 0);
      return { top: inicio - el.scrollTop, bottom: inicio + bloqueAlturas[i]! - el.scrollTop };
    },
  });
  const hijos = bloqueAlturas.map((_, i) => makeChild(() => i));
  const c = { children: hijos };
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Leyendo bloque 2 (y=400, top=-50).
  el.scrollTop = 450;
  await cuadros(1);
  const anclaEl = hijos[2]!;
  assert.equal(anclaEl.getBoundingClientRect().top, -50);

  // Se anteponen 10 filas con alto real 300 px cada una (+3000 px reales), más 1000 px de margen virtual.
  bloqueAlturas.unshift(...Array(10).fill(300));
  margenSuperior = 1000;
  // Actualiza índices de los hijos conservando los mismos nodos DOM existentes.
  const nuevos = Array.from({ length: 10 }, (_, k) => makeChild(() => k));
  const desplazados = hijos.map((node, oldIdx) =>
    Object.assign(node, {
      getBoundingClientRect() {
        const inicio = margenSuperior + bloqueAlturas.slice(0, oldIdx + 10).reduce((a, b) => a + b, 0);
        return { top: inicio - el.scrollTop, bottom: inicio + bloqueAlturas[oldIdx + 10]! - el.scrollTop };
      },
    }),
  );
  c.children = [...nuevos, ...desplazados];
  el.scrollHeight += 4000;

  // `VirtualThread` llama a `sostener()` sin sobrescribir `scrollTop` con estimaciones.
  p.sostener();
  assert.equal(el.scrollTop, 4450, "debe compensar los +4000 px reales exactos");
  assert.equal(anclaEl.getBoundingClientRect().top, -50, "el mensaje leído no debe saltar ni un píxel");
});

test("abrir el desplegable de pensando estando al final no salta a la mitad de la caja ni marca mensajes nuevos", async () => {
  const { el } = contenedorFalso(500, 2000);
  const p = createRoot(() => seguirElFondo());
  const oyentes = new Map<string, Array<(e: unknown) => void>>();
  const c = Object.assign(contenidoFalso(el, Array(10).fill(200)), {
    style: {} as Record<string, string>,
    addEventListener: (n: string, f: (e: unknown) => void) => void oyentes.set(n, [...(oyentes.get(n) ?? []), f]),
    removeEventListener: () => {},
  });
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);
  enElFinal(el.scrollHeight - el.clientHeight - el.scrollTop);

  const antes = el.scrollTop;
  // Clic en fase de captura sobre `<button aria-expanded="false">` («Pensando… >»)
  const boton = {
    closest: (sel: string) => (sel.includes("aria-expanded") ? boton : null),
    getAttribute: (name: string) => (name === "aria-expanded" ? "false" : null),
  };
  oyentes.get("click")?.forEach((fn) => fn({ target: boton }));

  // El bloque de pensamiento se despliega +1000 px.
  c.crecer(9, 1000);
  el.scrollHeight += 1000;
  disparar!(c, el.scrollHeight);
  await cuadros(3);

  assert.equal(el.scrollTop, antes, "abrir Pensando… debe dejar la cabecera exactamente donde se pulsó (0 px de salto)");
  assert.equal(p.hayNuevos(), false, "abrir un desplegable propio no debe anunciar mensajes nuevos");

  // Cerrar el desplegable (aria-expanded="true") durante un turno no mete relleno falso y vuelve a enganchar al fondo.
  const botonAbierto = {
    closest: (sel: string) => (sel.includes("aria-expanded") ? botonAbierto : null),
    getAttribute: (name: string) => (name === "aria-expanded" ? "true" : null),
  };
  oyentes.get("click")?.forEach((fn) => fn({ target: botonAbierto }));
  c.crecer(9, -1000);
  el.scrollHeight -= 1000;
  disparar!(c, el.scrollHeight);
  await cuadros(3);

  assert.equal(c.style.paddingBottom ?? "", "", "cerrar un desplegable no debe inyectar relleno vacío");
  assert.equal(p.alFondo(), true, "al cerrarse y volver a verse el final, sigue enganchado");
});

test("subir pocos píxeles con barra/inercia cerca del final y un encogimiento pequeño no re-engancha al fondo", async () => {
  const { el } = contenedorFalso(400, 2000);
  const p = createRoot(() => seguirElFondo());
  const c = contenidoFalso(el, Array(10).fill(200));
  p.contenedor(el as unknown as HTMLElement);
  p.contenido(c as unknown as HTMLElement);
  disparar!(c, 2000);
  await cuadros(3);

  // Sube 40 px sin evento `wheel` (p. ej. arrastrando barra o >250ms después de la rueda).
  el.scrollTop = el.scrollTop - 40;
  await cuadros(2);
  const donde = el.scrollTop;

  // Un encogimiento menor (-15 px) no debe volver a activar `sigue`.
  c.crecer(9, -15);
  el.scrollHeight -= 15;
  disparar!(c, el.scrollHeight);
  await cuadros(2);

  // Al crecer después, debe quedarse suelto donde lo dejó la persona.
  c.crecer(9, 400);
  el.scrollHeight += 400;
  disparar!(c, el.scrollHeight);
  await cuadros(2);
  assert.equal(el.scrollTop, donde, "no debe volver a arrastrar al fondo tras un encogimiento pequeño");
});
