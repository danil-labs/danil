import { For, Match, Show } from "solid-js";
import { manifiesto, t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { SettingsBlock, SettingsRow } from "../../../../ui/src/SettingsLayout";
import { ExternalLink } from "../../../../ui/src/ExternalLink";
import type { Provider } from "./ProvidersModel";
import type { createProveedores } from "./ProvidersState";
import type { createAccionesDeProveedores } from "./ProvidersActions";
import type { createFilaDeProveedor } from "./ProvidersRow";

export function createFormularioDeProveedor(p: Provider, proveedores: ReturnType<typeof createProveedores>, accionesDeProveedores: ReturnType<typeof createAccionesDeProveedores>, fila: ReturnType<typeof createFilaDeProveedor>) {
  const { conectar, conectarEnNavegador, setBorradores, choosing, setChoosing, verAreas, repos, seleccionar, trayendo, traidos } = proveedores;
  const { verProyectos, traer } = accionesDeProveedores;
  const { esperaAqui, estado, b, areasVisibles, abiertaAqui, espera } = fila;
  const Formulario = () => (
    <Match when={!p.connected && !esperaAqui()}>
      <form
        class="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void conectar(p);
        }}
      >
        {/* El camino sin pegar nada, cuando el proveedor lo
            tiene. Va arriba: es el que casi todo el mundo
            quiere. Con su aviso: por este camino GitHub no
            sabe dar solo lectura. */}
        {/* GitHub lo conecta desde la cabecera de la sección. */}
        <Show when={p.browser_login && p.id !== "github"}>
          <SettingsRow
            label={t("settings.providers.browser_row")}
            description={prosa(p.login_help)}
          >
            <Button
              size="sm"
              type="button"
              disabled={estado() !== null}
              onClick={() => void conectarEnNavegador(p)}
            >
              {p.id === "github" ? t("providers.github.connect") : t("settings.providers.browser_login", { name: p.name })}
            </Button>
          </SettingsRow>
        </Show>

        <For each={p.fields}>
          {(c) => (
            <SettingsRow
              label={
                <>
                  {prosa(c.label)}
                  <Show when={!c.required}>
                    <span class="ml-1 text-xs text-neutral-500">{t("settings.providers.optional")}</span>
                  </Show>
                </>
              }
              description={prosa(c.help)}
            >
              <Input
                class="w-[220px] font-mono text-xs"
                type="text"
                aria-label={prosa(c.label)}
                value={b().data[c.id] ?? ""}
                onInput={(e) =>
                  setBorradores((x) => ({
                    ...x,
                    [p.id]: {
                      token: b().token,
                      data: {
                        ...b().data,
                        [c.id]: e.currentTarget.value,
                      },
                    },
                  }))
                }
              />
            </SettingsRow>
          )}
        </For>

        {/* GitHub: un solo botón, con la App Danil; sin token pegado. */}
        <Show when={p.id !== "github"}>
        <SettingsRow
          label={
            p.browser_login
              ? t("settings.providers.or_token")
              : prosa(p.token_label)
          }
          description={
            <ExternalLink url={p.token_url}>
              {t("settings.providers.create_token", { name: p.name })}
            </ExternalLink>
          }
        >
          {/* Oculto mientras se pega, y en cuanto el llavero lo
              tiene no vuelve a existir ningún campo con él. La
              pantalla no lo enseña nunca, ni recortado. */}
          <Input
            class="w-[220px] font-mono text-xs"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder={prosa(p.token_label)}
            aria-label={prosa(p.token_label)}
            value={b().token}
            onInput={(e) =>
              setBorradores((x) => ({
                ...x,
                [p.id]: {
                  data: b().data,
                  token: e.currentTarget.value,
                },
              }))
            }
          />
          <Button
            variant="secondary"
            type="submit"
            disabled={estado() !== null || !b().token.trim()}
            title={
              !b().token.trim()
                ? t("settings.providers.missing_token", {
                    // Con el locale del catálogo: `toLowerCase()`
                    // a secas baja la `I` a `i` también en turco,
                    // donde su minúscula es `ı`.
                    label: prosa(p.token_label).toLocaleLowerCase(
                      manifiesto().formato,
                    ),
                  })
                : undefined
            }
          >
            {estado() === "conectando"
              ? t("settings.providers.connecting")
              : t("settings.providers.connect")}
          </Button>
        </SettingsRow>
        </Show>
      </form>
    </Match>
  );
  const Areas = () => (
    <Show when={areasVisibles()}>
      {(as) => (
        <SettingsBlock class="gap-1.5">
          <p class="m-0 text-xs text-neutral-500" title={prosa(p.area_help)}>
            {as().length === 0
              ? t("settings.providers.no_areas", {
                  label: prosa(p.areas_label),
                })
              : t("settings.providers.area_count", {
                  count: as().length,
                  label: prosa(
                    as().length === 1 ? p.area_label : p.areas_label,
                  ),
                })}
          </p>

          <Show when={choosing()[p.id]}>
            <Button variant="outline" size="compact" class="self-start" onClick={() => {
              setChoosing((current) => ({ ...current, [p.id]: false }));
              void verAreas(p.id);
            }}>
              {t("settings.providers.finish_selection")}
            </Button>
          </Show>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <For each={as()}>
              {(a) => {
                const rs = () => repos()[`${p.id}/${a.key}`];
                const abierto = () => abiertaAqui() === a.key;
                const selected = () => p.connected?.selected_area?.key === a.key ||
                  p.connected?.selected_areas?.some((area) => area.key === a.key);

                return (
                  <li>
                    <div class="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs">
                      <span class="min-w-0 flex-1 truncate">{a.name}</span>
                      <span class="font-mono text-caption text-neutral-500">{a.key}</span>
                      <Show when={p.id !== "github" && (!p.select_area || selected())}>
                        <Button
                          variant="outline"
                          size="compact"
                          disabled={estado() !== null}
                          title={espera()}
                          onClick={() => void verProyectos(p.id, a.key)}
                        >
                          {abierto() ? t("settings.providers.hide") : t("settings.providers.show")}
                        </Button>
                      </Show>
                      <Show when={p.select_area && choosing()[p.id]}>
                        <Button
                          variant="outline"
                          size="compact"
                          disabled={estado() !== null}
                          onClick={() => void seleccionar(p.id, a.key, !selected())}
                        >
                          {selected() ? t("settings.providers.remove_area") : t("settings.providers.select_area")}
                        </Button>
                      </Show>
                    </div>

                    <Show when={abierto() && rs()?.length === 0}>
                      <p class="m-0 py-2 text-xs text-neutral-500">{t("settings.providers.no_repos")}</p>
                    </Show>

                    <Show when={abierto() && rs()?.length}>
                      <ul class="mt-1 mb-1.5 ml-3 flex list-none flex-col gap-1 border-l border-border p-0 pl-2.5">
                        {/* El identificador solo aparece cuando
                            dice algo que el nombre no dice. En
                            Bitbucket suelen ser idénticos, y
                            repetirlos convierte una lista de
                            noventa y nueve en una de ciento
                            noventa y ocho. */}
                        <For each={rs() ?? []}>
                          {(r) => (
                            <li class="flex items-baseline gap-2 text-xs">
                              <span class="min-w-0 truncate">{r.name}</span>
                              <Show when={r.slug !== r.name}>
                                <span class="min-w-0 truncate font-mono text-caption text-neutral-500">{r.slug}</span>
                              </Show>
                              {/* Traerlo es el acto: el botón
                                  vive en la fila del repositorio
                                  y no en una pantalla aparte, se
                                  decide mirando la lista, que es
                                  donde se reconoce cuál es
                                  cuál. */}
                              <Button
                                variant="outline"
                                size="compact"
                                class="ml-auto shrink-0"
                                disabled={trayendo() !== null}
                                title={
                                  traidos()[r.clone_url]
                                    ? t("settings.providers.already_title")
                                    : t("settings.providers.attach_title")
                                }
                                onClick={() => void traer(p.id, r)}
                              >
                                {traidos()[r.clone_url]
                                  ? t("settings.providers.already")
                                  : trayendo() === r.clone_url
                                    ? t("settings.providers.attaching")
                                    : t("settings.providers.attach")}
                              </Button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </SettingsBlock>
      )}
    </Show>
  );
  return { Formulario, Areas };
}
