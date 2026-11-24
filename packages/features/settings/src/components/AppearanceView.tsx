import Check from "lucide-solid/icons/check";
import ImagePlus from "lucide-solid/icons/image-plus";
import Trash2 from "lucide-solid/icons/trash-2";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { elegirVeloDeFondo, elegirVeloDePaneles, elegirVeloDePestanas, imagenDelWorkspace, ponerFondoPropio } from "../../../../ui/src/lib/chat-background-store";
import { VELO_DE_PANELES_MAX, VELO_DE_PANELES_MIN, VELO_DE_PESTANAS_MAX, VELO_DE_PESTANAS_MIN } from "../../../../ui/src/lib/chat-background";
import { chooseDarkStyle, chooseLightStyle, elegirApariencia, type DarkStyle, type LightStyle } from "../../../../ui/src/lib/theme";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { Pressable } from "../../../../ui/src/Pressable";
import type { MaquinasDeAjustes } from "../model/machines-port";
import type { PiezasDeAjustes } from "../model/features-port";
import { createApariencia } from "./AppearanceState";
import { temas, darkStyles, lightStyles, motor, fondos, VISIBILITY_ID, TABS_VEIL_ID, PANELS_VEIL_ID } from "./AppearanceOptions";
import { StylePicker } from "./AppearanceStylePicker";
import { Input } from "../../../../ui/src/Input";

/**
 * Tema, fondo de los chats y la cara propia de cada agente.
 *
 * El fondo de un agente sigue siendo el suyo: el de aquí solo pinta el chat
 * que no tiene uno. La imagen de la cara no entra al catálogo de cuerpos.
 */
export default function Appearance(props: { workspace?: string | null; proyecto: string; maquinas: MaquinasDeAjustes; piezas: PiezasDeAjustes }) {
  const { tema, estilo, estiloClaro, hayPropia, elegirImagenPropia, fondo, pulsarFondo, vistaPropia, velo, visibilidad, veloPestanas, veloPaneles, backgroundFailure, cargado, filas, AstroAvatar, displayName, ocupada, ponerAvatar, elegirImagen, fallo } = createApariencia(props);
  return (
    <SettingsPanel>
      <SettingsSection title={t("settings.appearance.title")}>
        <SettingsRow label={t("settings.appearance.theme.title")}>
          <div
            role="radiogroup"
            aria-label={t("settings.appearance.theme.title")}
            class="inline-flex gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
          >
            <For each={temas()}>
              {({ id, Icono, label }) => (
                <Pressable
                  role="radio"
                  aria-checked={tema() === id}
                  aria-label={label}
                  title={label}
                  class={cn(
                    "flex h-7 w-8 items-center justify-center rounded-md border outline-none focus:outline-none focus-visible:outline-none",
                    tema() === id
                      ? "border-border bg-surface text-neutral-950"
                      : "border-transparent text-neutral-500 hover:text-neutral-950",
                  )}
                  onClick={() => elegirApariencia(id)}
                >
                  <Icono size={16} />
                </Pressable>
              )}
            </For>
          </div>
        </SettingsRow>

        <StylePicker
          theme="dark"
          title={t("settings.appearance.dark_style.title")}
          description={t("settings.appearance.dark_style.description")}
          options={darkStyles()}
          value={estilo()}
          onPick={(id) => chooseDarkStyle(id as DarkStyle)}
        />
        <StylePicker
          theme="light"
          title={t("settings.appearance.light_style.title")}
          description={t("settings.appearance.light_style.description")}
          options={lightStyles()}
          value={estiloClaro()}
          onPick={(id) => chooseLightStyle(id as LightStyle)}
        />

        <SettingsRow
          label={t("settings.appearance.background.title")}
          description={t("settings.appearance.background.description")}
        >
          <Show when={hayPropia()}>
            <Button size="sm" variant="ghost" onClick={() => void elegirImagenPropia()}>
              <ImagePlus size={14} />
              {t("settings.appearance.background.change")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                ponerFondoPropio(null);
                void motor().then((m) => m.quitarFondoPropio());
              }}
            >
              <Trash2 size={14} />
              {t("settings.appearance.background.clear")}
            </Button>
          </Show>
          <div class="flex gap-2" role="list">
            <For each={fondos()}>
              {({ id, label }) => (
                <div role="listitem">
                  <Pressable
                    aria-pressed={fondo() === id}
                    aria-label={label}
                    title={label}
                    class={cn(
                      "relative block h-11 w-[72px] overflow-hidden rounded-md bg-surface outline-none transition-opacity focus:outline-none focus-visible:outline-none",
                      id === "propia" && !hayPropia()
                        ? "border border-dashed border-border-strong"
                        : "border border-border",
                      fondo() === id ? "opacity-100" : "opacity-80 hover:opacity-100",
                    )}
                    onClick={() => pulsarFondo(id)}
                  >
                    <Show
                      when={id === "propia" ? (imagenDelWorkspace() ?? vistaPropia()) : undefined}
                      fallback={
                        <span
                          class={cn(
                            "absolute inset-0",
                            id === "propia"
                              ? "grid place-items-center bg-surface-muted text-neutral-500"
                              : "bg-surface",
                          )}
                          aria-hidden="true"
                        >
                          <Show when={id === "propia"}>
                            <ImagePlus size={16} />
                          </Show>
                        </span>
                      }
                    >
                      {(url) => (
                        <span
                          class="absolute inset-0 bg-cover bg-center"
                          style={{ "background-image": `url("${url()}")` }}
                          aria-hidden="true"
                        />
                      )}
                    </Show>
                    <Show when={id !== "propia"}>
                      <span
                        class="absolute inset-0 bg-surface"
                        style={{ opacity: String(velo()) }}
                        aria-hidden="true"
                      />
                    </Show>
                    <Show when={fondo() === id}>
                      <span
                        class="absolute top-1 right-1 grid size-4 place-items-center rounded-full border border-border bg-surface text-neutral-950"
                        aria-hidden="true"
                      >
                        <Check size={10} />
                      </span>
                    </Show>
                  </Pressable>
                </div>
              )}
            </For>
          </div>
        </SettingsRow>

        <SettingsRow
          label={
            <label for={VISIBILITY_ID}>
              {t("settings.appearance.background.visibility", { percent: visibilidad() })}
            </label>
          }
        >
          <Input
            id={VISIBILITY_ID}
            type="range"
            min="0"
            max="100"
            step="5"
            variant="range"
            class="w-40 outline-none focus:outline-none focus-visible:outline-none"
            value={visibilidad()}
            onInput={(e) => {
              elegirVeloDeFondo(1 - Number(e.currentTarget.value) / 100);
              void motor().then((m) => m.guardarVelos());
            }}
          />
        </SettingsRow>
        <SettingsRow
          label={
            <label for={TABS_VEIL_ID}>
              {t("settings.appearance.tabs_veil", { percent: Math.round(veloPestanas() * 100) })}
            </label>
          }
          description={t("settings.appearance.tabs_veil.description")}
        >
          <Input
            id={TABS_VEIL_ID}
            type="range"
            min={VELO_DE_PESTANAS_MIN * 100}
            max={VELO_DE_PESTANAS_MAX * 100}
            step="5"
            variant="range"
            class="w-40 outline-none focus:outline-none focus-visible:outline-none"
            value={Math.round(veloPestanas() * 100)}
            onInput={(e) => {
              elegirVeloDePestanas(Number(e.currentTarget.value) / 100);
              void motor().then((m) => m.guardarVelos());
            }}
          />
        </SettingsRow>
        <SettingsRow
          label={
            <label for={PANELS_VEIL_ID}>
              {t("settings.appearance.panels_veil", { percent: Math.round(veloPaneles() * 100) })}
            </label>
          }
          description={t("settings.appearance.panels_veil.description")}
        >
          <Input
            id={PANELS_VEIL_ID}
            type="range"
            min={VELO_DE_PANELES_MIN * 100}
            max={VELO_DE_PANELES_MAX * 100}
            step="5"
            variant="range"
            class="w-40 outline-none focus:outline-none focus-visible:outline-none"
            value={Math.round(veloPaneles() * 100)}
            onInput={(e) => {
              elegirVeloDePaneles(Number(e.currentTarget.value) / 100);
              void motor().then((m) => m.guardarVelos());
            }}
          />
        </SettingsRow>
        <Show when={backgroundFailure()}>
          {(text) => <p role="alert" class="m-0 text-xs text-error-strong">{text()}</p>}
        </Show>
      </SettingsSection>

      <SettingsSection title={t("settings.appearance.avatar.title")}>
        <Show when={cargado() && filas().length === 0}>
          <p class="m-0 py-3.5 text-ui text-neutral-500">
            {t("settings.appearance.avatar.empty")}
          </p>
        </Show>
        <div role="list" class="grid min-w-0">
          <For each={filas()}>
            {(fila) => (
              <SettingsRow
                role="listitem"
                lead={
                  <AstroAvatar
                    name={fila.name}
                    body={fila.profile.body}
                    avatar={fila.profile.avatar}
                    status="awake"
                    size={32}
                  />
                }
                label={<span class="block truncate">{displayName(fila.name, fila.profile)}</span>}
              >
                <Show when={fila.profile.avatar}>
                  <Button
                    size="iconCompact"
                    variant="ghost"
                    disabled={ocupada() === fila.id}
                    aria-label={t("settings.appearance.avatar.clear")}
                    onClick={() => void ponerAvatar(fila, null)}
                  >
                    <X size={14} />
                  </Button>
                </Show>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={ocupada() === fila.id || !fila.project}
                  title={fila.project ? undefined : t("settings.appearance.avatar.no_folder")}
                  onClick={() => void elegirImagen(fila)}
                >
                  <ImagePlus size={14} />
                  {fila.profile.avatar
                    ? t("settings.appearance.avatar.change")
                    : t("settings.appearance.avatar.pick")}
                </Button>
              </SettingsRow>
            )}
          </For>
        </div>
        <Show when={fallo()}>{(text) => <p class="m-0 text-xs text-error-strong">{text()}</p>}</Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
