import { invoke } from "../../lib/invoke.ts";
import { confirm } from "@tauri-apps/plugin-dialog";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Toggle } from "../../ui/Toggle";
import { EmptyState } from "../../ui/EmptyState";
import Search from "lucide-solid/icons/search";
import { SettingsRow, SettingsSection } from "./layout";
import { lockedBy } from "../../lib/governance";
import { cn } from "../../lib/utils";
import { Governed } from "./Governed";

/** Una skill de una carpeta adjunta o de un repositorio. La compone `practices::SkillDeFuente`. */
type SkillDeFuente = {
  source: string;
  source_name: string;
  name: string;
  description: string;
  enabled: boolean;
  origin: string;
  /** Qué agentes la leen. Lo decide la carpeta en que está, no esta pantalla. */
  providers: string[];
  /** Un motor anterior no los manda: solo carpetas, encendidas y sin sombra. */
  kind?: "folder" | "repository";
  source_enabled?: boolean;
  shadowed_by?: { source: string; source_name: string } | null;
  /** El nombre con que se invoca hoy (`/<invoked_as>`), o `null` si no llega a ningún agente. */
  invoked_as?: string | null;
};

type Grupo = { source: string; name: string; kind: "folder" | "repository"; on: boolean; skills: SkillDeFuente[] };

const fuenteEncendida = (s: SkillDeFuente) => s.source_enabled !== false;

/**
 * La nota de nombre repetido. Dice el nombre real con que se invoca, no quién
 * «gana»: con dos repositorios del mismo nombre ninguno se queda con el corto,
 * y la más vieja no trae `shadowed_by`. La otra fuente sale de la sombra o de
 * la otra fila con ese nombre.
 */
function notaDeNombre(s: SkillDeFuente, todas: readonly SkillDeFuente[]): string | null {
  const otra =
    s.shadowed_by?.source_name ??
    todas.find((o) => o.name === s.name && o.source !== s.source)?.source_name;
  if (s.invoked_as && s.invoked_as !== s.name) {
    return otra
      ? t("settings.skills.invoked_as", { invoked: s.invoked_as, source: otra })
      : t("settings.skills.invoked_as_alone", { invoked: s.invoked_as });
  }
  if (!s.invoked_as && s.shadowed_by) {
    return t("settings.skills.shadowed_off", { source: s.shadowed_by.source_name });
  }
  return null;
}

export function SkillsDeFuentes() {
  const [skills, setSkills] = createSignal<SkillDeFuente[]>([]);
  const [ocupada, setOcupada] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [busca, setBusca] = createSignal("");

  const clave = (s: SkillDeFuente) => `${s.source}/${s.name}`;

  // Sin locale: es comparar identificadores, no ordenar para una persona. Con
  // `tr`, la `I` de una skill baja a `ı` y deja de encontrarse.
  const visibles = createMemo(() => {
    const q = busca().trim().toLowerCase();
    if (!q) return skills();
    return skills().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.invoked_as ?? "").toLowerCase().includes(q) ||
        s.source_name.toLowerCase().includes(q) ||
        s.providers.some((a) => a.toLowerCase().includes(q)),
    );
  });

  // Las de una fuente apagada no se alternan una por una ni en bloque.
  const alternables = createMemo(() => visibles().filter(fuenteEncendida));
  const encendidas = createMemo(() => skills().filter((s) => s.enabled && fuenteEncendida(s)).length);
  const apagadasVisibles = createMemo(() => alternables().filter((s) => !s.enabled));

  const grupos = createMemo(() => {
    const porFuente = new Map<string, Grupo>();
    for (const s of visibles()) {
      let g = porFuente.get(s.source);
      if (!g) {
        g = { source: s.source, name: s.source_name, kind: s.kind ?? "folder", on: fuenteEncendida(s), skills: [] };
        porFuente.set(s.source, g);
      }
      g.skills.push(s);
    }
    return [...porFuente.values()];
  });

  // Cuántos agentes hay en total, para saber cuándo una skill es de todos sin
  // enumerarlos. Sale de las propias filas: la lista de agentes es de Rust.
  const agentes = createMemo(() =>
    Math.max(0, ...skills().map((s) => s.providers.length)),
  );

  async function refrescar() {
    setSkills(await invoke<SkillDeFuente[]>("list_source_skills"));
  }

  async function alternar(s: SkillDeFuente) {
    setOcupada(clave(s));
    setFallo(null);
    try {
      await invoke("set_source_skill", {
        source: s.source,
        skill: s.name,
        on: !s.enabled,
      });
      await refrescar();
    } catch (error) {
      setFallo({ ...asFailure(error), what: t("settings.skills.error_source") });
    } finally {
      setOcupada(null);
    }
  }

  // Borra del repositorio de la persona, no de una copia nuestra. Se avisa
  // antes: apagar es reversible y esto no, y quien lo use en otro editor deja
  // de tenerla.
  async function desinstalar(s: SkillDeFuente) {
    if (
      !(await confirm(
        t("settings.skills.uninstall_confirm", { name: s.name, path: s.origin }),
        { kind: "warning" },
      ))
    ) {
      return;
    }
    setOcupada(clave(s));
    setFallo(null);
    try {
      await invoke("uninstall_source_skill", { source: s.source, skill: s.name });
      await refrescar();
    } catch (error) {
      setFallo({ ...asFailure(error), what: t("settings.skills.error_uninstall") });
    } finally {
      setOcupada(null);
    }
  }

  // En bloque sobre lo que se ve, no sobre todo: con ochenta filas, buscar y
  // encender lo filtrado es el gesto; un «encender todas» a secas enciende
  // ochenta capacidades de una vez.
  async function alternarVisibles(on: boolean) {
    const objetivo = alternables().filter((s) => s.enabled !== on);
    if (objetivo.length === 0) return;
    setOcupada("*");
    setFallo(null);
    try {
      for (const s of objetivo) {
        await invoke("set_source_skill", { source: s.source, skill: s.name, on });
      }
      await refrescar();
    } catch (error) {
      setFallo({ ...asFailure(error), what: t("settings.skills.error_source") });
    } finally {
      setOcupada(null);
    }
  }

  // Encender o quitar un repositorio arriba cambia esta lista.
  const alCambiarFuentes = () => void refrescar().catch((error) => setFallo(asFailure(error)));
  onMount(() => {
    alCambiarFuentes();
    window.addEventListener("harness:sources", alCambiarFuentes);
    onCleanup(() => window.removeEventListener("harness:sources", alCambiarFuentes));
  });

  return (
    <SettingsSection
      title={t("settings.skills.sources_title")}
      aside={
        <Show when={skills().length > 0}>
          <span class="shrink-0 text-xs text-neutral-500">
            {t("settings.skills.on_of", {
              on: encendidas(),
              total: skills().length,
            })}
          </span>
          <div class="relative w-56 shrink-0">
            <Search
              size={14}
              class="pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2 text-neutral-500"
            />
            <Input
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              placeholder={t("settings.skills.search")}
              aria-label={t("settings.skills.search")}
              class="pl-8"
            />
          </div>
          <Button
            variant="ghost"
            size="compact"
            disabled={ocupada() !== null || alternables().length === 0 || lockedBy("context_sources") !== null}
            onClick={() => void alternarVisibles(apagadasVisibles().length > 0)}
          >
            {apagadasVisibles().length > 0
              ? t("settings.skills.turn_on_n", { count: apagadasVisibles().length })
              : t("settings.skills.turn_off_n", { count: alternables().length })}
          </Button>
        </Show>
      }
    >
      <Show when={fallo()}>{(error) => <FailureNote f={error()} />}</Show>

      <Show
        when={skills().length > 0}
        fallback={
          <EmptyState
            title={t("settings.skills.sources_empty")}
            description={t("settings.skills.sources_empty_help")}
          />
        }
      >
        <Governed section="context_sources">
        <For each={grupos()}>
          {(g) => (
            <div class="grid min-w-0">
              <div class="flex min-w-0 flex-wrap items-center gap-2 pt-4 pb-1">
                <h4 class="m-0 min-w-0 truncate text-xs font-[560] text-neutral-500">{g.name}</h4>
                <Badge forma="dato">
                  {g.kind === "repository" ? t("settings.skills.kind_repository") : t("settings.skills.kind_folder")}
                </Badge>
                <Show when={!g.on}>
                  <span class="text-xs text-neutral-500">{t("settings.skills.source_off")}</span>
                </Show>
              </div>
              <For each={g.skills}>
                {(s) => (
                  <SettingsRow
                    label={
                      // La ruta es lo que se puede ir a mirar y editar.
                      <span class={cn("block truncate", !g.on && "text-neutral-500")} title={s.origin}>
                        {s.name}
                      </span>
                    }
                    description={
                      <Show when={s.description || notaDeNombre(s, skills())}>
                        <span class="grid min-w-0">
                          <Show when={s.description}>
                            <span class="block truncate" title={s.description}>
                              {s.description}
                            </span>
                          </Show>
                          <Show when={notaDeNombre(s, skills())}>
                            {(nota) => (
                              <span class="block truncate text-warning-strong" title={nota()}>
                                {nota()}
                              </span>
                            )}
                          </Show>
                        </span>
                      </Show>
                    }
                  >
                    {/* Quién la lee lo decide su carpeta: sin decirlo, alguien
                        enciende para Claude una skill que solo carga Codex. */}
                    <span class="flex flex-wrap justify-end gap-1">
                      <Show
                        when={s.providers.length !== agentes()}
                        fallback={<Badge>{t("settings.skills.all_agents")}</Badge>}
                      >
                        <For each={s.providers}>{(a) => <Badge forma="dato">{a}</Badge>}</For>
                      </Show>
                    </span>
                    {/* Apagado por su fuente: dice dónde se enciende. El `title`
                        va fuera porque el toggle deshabilitado no recibe el puntero. */}
                    <span
                      class="inline-flex shrink-0"
                      title={
                        g.on
                          ? undefined
                          : g.kind === "repository"
                            ? t("settings.skills.source_off_repository")
                            : t("settings.skills.source_off_folder")
                      }
                    >
                      <Toggle
                        checked={s.enabled}
                        disabled={ocupada() !== null || !g.on}
                        label={s.name}
                        onChange={() => void alternar(s)}
                      />
                    </span>
                    {/* Un repositorio es una copia que Danil trae: se apaga, no se borra. */}
                    <Show when={g.kind === "folder"}>
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={ocupada() !== null}
                        onClick={() => void desinstalar(s)}
                      >
                        {t("settings.skills.uninstall")}
                      </Button>
                    </Show>
                  </SettingsRow>
                )}
              </For>
            </div>
          )}
        </For>
        </Governed>
      </Show>
    </SettingsSection>
  );
}
