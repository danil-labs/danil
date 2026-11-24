import { FREE_ROUTER_MODEL, FREE_ROUTER_OPENCODE, OPENCODE } from "../../../../ui/src/lib/tasks/index.ts";
import { routerOfferState } from "../../../../ui/src/lib/tasks/index.ts";
import { createMemo, createSignal } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { listAccounts, getAccountLimits } from "../queries";
import type { Query } from "../../../../ui/src/lib/limits";
import { modelPresentation, effortOptions, effortValue, esFavorito, favoritosDeModelos, seccionDeModelo, type GrupoDeModelos, type OpcionDeModelo } from "../../../../ui/src/lib/models";
import { createPref } from "../../../../../apps/desktop/src/lib/prefs";
import { danilCreditsTierLabel } from "../../../../ui/src/lib/tasks/index.ts";
import { DANIL_CREDITS, isDanilCreditsModel } from "../model/danil-credits";
import { esServicio, nombreDeServicio, gruposDeModelos, nombreDeNivel, type SelectorDeModeloProps } from "./model-picker-types";

export function createSelectorDeModelo(props: SelectorDeModeloProps, deps: { campo: () => HTMLInputElement | undefined }) {
  const [abierto, setAbierto] = createSignal(false);
  const [busqueda, setBusqueda] = createSignal("");
  const [activo, setActivo] = createSignal("");
  const [seccion, setSeccion] = createSignal("favorites");
  const [favoritos, setFavoritos] = createPref<string[]>("chat.model.favorites", []);
  const [cupoGo, setCupoGo] = createSignal<Query | null>(null);
  const filas = new Map<string, HTMLElement>();
  const consent = props.createFreeRouterConsent({ agente: () => FREE_ROUTER_OPENCODE });
  const estadoRouter = () => routerOfferState(
    consent.cargado() ? (consent.texto() ? { enabled: consent.texto()!.policy.enabled, accepted: consent.aceptado() } : null) : undefined,
    consent.routeAvailable(),
  );

  const elegido = () =>
    props.models.find(
      (opcion) =>
        opcion.superficie === props.superficie && opcion.model.id === props.model,
    );
  const todosLosGrupos = createMemo(() => gruposDeModelos(props.models, busqueda()));
  const bloqueado = (opcion: OpcionDeModelo) =>
    !!props.lockedAgent && opcion.agent !== props.lockedAgent;
  const disponible = (opcion: OpcionDeModelo) => opcion.usable && !bloqueado(opcion);
  const creditsModels = () =>
    props.models.filter((option) => isDanilCreditsModel(option.model.id));
  const creditsModel = () => {
    const credits = creditsModels();
    const current = elegido();
    if (current && isDanilCreditsModel(current.model.id)) return current;
    return (
      credits.find((option) => option.model.id === DANIL_CREDITS.modelId && disponible(option)) ??
      credits.find(disponible) ??
      credits[0]
    );
  };
  const routerModel = () => {
    const router = props.models.filter((option) => option.model.id === FREE_ROUTER_MODEL);
    return router.find(disponible) ?? router[0];
  };
  const servicio = (opcion: OpcionDeModelo | undefined) => ({
    ready: !props.disabled && !!opcion && disponible(opcion),
    selected: !!opcion && opcion.key === elegido()?.key,
    onUse: () => { if (opcion) elegir(opcion.key); },
  });
  const creditsTiers = () => {
    const byId = new Map(creditsModels().map((option) => [option.model.id, option]));
    return DANIL_CREDITS.tiers
      .map((tierId) => byId.get(tierId))
      .filter((option): option is OpcionDeModelo => !!option)
      .map((option) => ({
        id: option.model.id,
        label: option.model.label,
        ready: !props.disabled && disponible(option),
        selected: option.key === elegido()?.key,
        onUse: () => elegir(option.key),
      }));
  };
  const grupos = createMemo<GrupoDeModelos[]>(() => {
    const busquedaActiva = busqueda().trim().length > 0;
    const actual = seccion();
    // Buscar es transversal: al escribir, se descubren los modelos sin tener
    // que adivinar primero en qué proveedor viven.
    if (busquedaActiva && actual === "favorites") return todosLosGrupos();
    if (actual === "favorites") {
      const elegibles = favoritosDeModelos(props.models, favoritos());
      return gruposDeModelos(elegibles, busqueda());
    }
    return todosLosGrupos().filter((grupo) => grupo.id === actual);
  });
  const visibles = () =>
    (seccion() === "danil" ? [] : grupos())
      .flatMap((grupo) => grupo.models)
      .filter(disponible);

  const niveles = createMemo(() =>
    props.onEffort && props.efforts?.length
      ? effortOptions(props.efforts, props.defaultEffort ?? null)
      : [],
  );
  const nivel = () => effortValue(props.effort ?? "", props.defaultEffort ?? null);
  const rotuloDeNivel = () => {
    const option = elegido();
    const id = option?.model.id ?? props.model;
    if (isDanilCreditsModel(id)) {
      return option?.model.label || danilCreditsTierLabel(id) || undefined;
    }
    const opcion = niveles().find((o) => o.value === nivel());
    return opcion ? nombreDeNivel(opcion.label) : undefined;
  };
  const selectedName = () => {
    const option = elegido();
    const servicio = nombreDeServicio(option?.model.id ?? props.model);
    if (servicio) return servicio;
    return option ? modelPresentation(option.model.id, option.model.label).label : props.model ? modelPresentation(props.model).label : null;
  };
  const nombre = () => selectedName() ?? (props.missingModelLabel || t("chat.model.none"));

  const mostrarActivo = () => {
    queueMicrotask(() => filas.get(activo())?.scrollIntoView({ block: "nearest" }));
  };

  const abrir = (next: boolean) => {
    if (next && props.disabled) return;
    setAbierto(next);
    if (next) {
      void consent.cargar();
      const options = props.invokeOptions;
      setCupoGo(null);
      if (props.models.some((m) => m.proveedor.id === "opencode-go")) {
        void listAccounts(OPENCODE, options)
          .then((accounts) => {
            if (!accounts.active) return null;
            return getAccountLimits(OPENCODE, accounts.active, false, options);
          })
          .then(setCupoGo)
          .catch(() => setCupoGo(null));
      }
    }
    if (!next) {
      setBusqueda("");
      setActivo("");
      return;
    }
    const gruposAbiertos = todosLosGrupos();
    // La sección sale del grupo que de verdad contiene el modelo: agrupar y
    // proveedor no siempre coinciden, y abrir una sección inexistente deja la
    // lista vacía aunque el modelo esté elegido. Sin modelo elegido, la primera
    // fila que se puede usar; los servicios de Danil tienen su propia sección.
    const primeroDisponible = gruposAbiertos
      .flatMap((grupo) => grupo.models)
      .find(disponible);
    const claveInicial = esServicio(elegido()) ? "" : elegido()?.key ?? primeroDisponible?.key ?? "";
    const seccionElegida = esServicio(elegido())
      ? "danil"
      : seccionDeModelo(gruposAbiertos, claveInicial) ??
        (favoritos().length > 0 ? "favorites" : gruposAbiertos[0]?.id ?? "danil");
    setSeccion(seccionElegida);
    setActivo(claveInicial);
    setTimeout(() => {
      deps.campo()?.focus();
      mostrarActivo();
    });
  };

  const buscar = (value: string) => {
    setBusqueda(value);
    setActivo(
      gruposDeModelos(props.models, value)
        .flatMap((grupo) => grupo.models)
        .find(disponible)?.key ?? "",
    );
  };

  const mover = (delta: number) => {
    const opciones = visibles();
    if (opciones.length === 0) return;
    const i = opciones.findIndex((opcion) => opcion.key === activo());
    const inicio = i < 0 ? 0 : i;
    setActivo(opciones[(inicio + delta + opciones.length) % opciones.length].key);
    mostrarActivo();
  };

  const elegir = (key: string) => {
    if (props.disabled) return;
    const opcion = props.models.find((item) => item.key === key && disponible(item));
    if (!opcion) return;
    props.onChange(opcion);
    abrir(false);
  };

  const alternarFavorito = (key: string) => {
    setFavoritos(
      esFavorito(key, favoritos())
        ? favoritos().filter((favorito) => favorito !== key)
        : [...favoritos(), key],
    );
  };
  return { abierto, busqueda, activo, setActivo, seccion, setSeccion, favoritos, cupoGo, filas, consent, estadoRouter, elegido, todosLosGrupos, bloqueado, disponible, creditsModel, creditsTiers, routerModel, servicio, grupos, visibles, niveles, nivel, rotuloDeNivel, selectedName, nombre, abrir, buscar, mover, elegir, alternarFavorito };
}
