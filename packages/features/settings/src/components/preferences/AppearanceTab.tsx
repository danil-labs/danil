import Monitor from "lucide-solid/icons/monitor";
import Moon from "lucide-solid/icons/moon";
import Sun from "lucide-solid/icons/sun";
import { createSignal, For } from "solid-js";
import {
  Button,
  Select,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  cn,
} from "@danil/ui";

export function AppearanceTab() {
  const [tema, setTema] = createSignal<"sistema" | "claro" | "oscuro">("sistema");
  const [darkStyle, setDarkStyle] = createSignal("graphite");
  const [lightStyle, setLightStyle] = createSignal("graphite");
  const [fondo, setFondo] = createSignal("neutro");
  const [visibilidad, setVisibilidad] = createSignal(100);

  const temas = [
    { id: "sistema", Icono: Monitor, label: "Como el sistema" },
    { id: "claro", Icono: Sun, label: "Claro" },
    { id: "oscuro", Icono: Moon, label: "Oscuro" },
  ] as const;

  return (
    <SettingsPanel>
      <SettingsSection title="Apariencia">
        <SettingsRow label="Tema">
          <div
            role="radiogroup"
            aria-label="Tema"
            class="inline-flex gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
          >
            <For each={temas}>
              {({ id, Icono, label }) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={tema() === id}
                  aria-label={label}
                  title={label}
                  class={cn(
                    "flex h-7 w-8 items-center justify-center rounded-md border",
                    tema() === id
                      ? "border-border bg-surface text-neutral-950 font-semibold"
                      : "border-transparent text-neutral-500 hover:text-neutral-950",
                  )}
                  onClick={() => setTema(id)}
                >
                  <Icono size={14} />
                </button>
              )}
            </For>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Estilo del modo oscuro"
          description="Cómo se ve la app cuando el tema es oscuro."
        >
          <Select
            aria-label="Estilo del modo oscuro"
            value={darkStyle()}
            onChange={(e) => setDarkStyle(e.currentTarget.value)}
          >
            <option value="graphite">Grafito</option>
            <option value="navy">Azul</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Estilo del modo claro"
          description="Cómo se ve la app cuando el tema es claro."
        >
          <Select
            aria-label="Estilo del modo claro"
            value={lightStyle()}
            onChange={(e) => setLightStyle(e.currentTarget.value)}
          >
            <option value="graphite">Grafito</option>
            <option value="violet">Violeta</option>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Fondo de los chats"
        description="La imagen que se ve detrás de la conversación."
      >
        <SettingsRow label="Fondo">
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant={fondo() === "neutro" ? "secondary" : "ghost"}
              onClick={() => setFondo("neutro")}
            >
              Neutro
            </Button>
            <Button
              size="sm"
              variant={fondo() === "propia" ? "secondary" : "ghost"}
              onClick={() => setFondo("propia")}
            >
              Fondo propio
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow
          label={`Cuánto se ve la imagen · ${visibilidad()}%`}
          description="Ajusta la opacidad de la imagen de fondo."
        >
          <input
            type="range"
            min="10"
            max="100"
            value={visibilidad()}
            onInput={(e) => setVisibilidad(Number(e.currentTarget.value))}
            class="w-36 cursor-pointer"
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
