import ArrowRight from "lucide-solid/icons/arrow-right";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { MarcaProveedor } from "../../../../ui/src/icons";
import { Pressable } from "../../../../ui/src/Pressable";
import { GoogleDriveMark, ZoteroMark } from "../../../../ui/src/toolMarks";

/** «Lo ves en la dirección: bitbucket.org/espacio/…», con el espacio en negrita como el diseño. */
export function EspacioEnNegrita() {
  const [antes, despues] = t("onboarding.tools.bitbucket.space_hint", { space: "@@" }).split("@@");
  return (
    <>
      {antes}
      <b class="font-semibold">{t("onboarding.tools.bitbucket.space_word")}</b>
      {despues}
    </>
  );
}

/** Drive y las bibliotecas no son servicios de código ni MCP conocidos: sus marcas viven con las de los plugins. */
export function MarcaIntegracion(props: { id: string; size?: number }) {
  return (
    <Switch fallback={<MarcaProveedor id={props.id} size={props.size} />}>
      <Match when={props.id === "drive"}><GoogleDriveMark size={props.size} /></Match>
      <Match when={props.id === "zotero"}><ZoteroMark size={props.size} /></Match>
    </Switch>
  );
}

/** «Ver más»: texto al aire, los íconos de lo escondido encimados en diagonal y la flecha. */
export function VerMas(props: {
  abierto: boolean;
  resto: { id: string; nombre: string; icono: JSX.Element }[];
  /** Los que se asoman primero; de vista previa sólo caben tres. */
  primero?: string[];
  onClick: () => void;
}) {
  const asoman = () => {
    const orden = (id: string) => {
      const i = props.primero?.indexOf(id) ?? -1;
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...props.resto].sort((a, b) => orden(a.id) - orden(b.id)).slice(0, 3);
  };
  return (
    <Show when={props.resto.length > 0 || props.abierto}>
      <Pressable
        class="group inline-flex h-10 cursor-pointer items-start self-start border-0 bg-transparent px-0.5 pt-1.5 text-xs font-medium text-neutral-500 outline-none hover:text-neutral-950 focus-visible:rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        aria-expanded={props.abierto}
        aria-label={props.abierto ? undefined : t("onboarding.tools.more_label", { names: props.resto.map((r) => r.nombre).join(", ") })}
        onClick={() => props.onClick()}
      >
        <span class="inline-flex items-center">
          <span>{props.abierto ? t("onboarding.tools.less") : t("onboarding.tools.more")}</span>
          <Show when={!props.abierto}>
            <span class="relative z-[1] mr-[-3px] ml-[-2px] inline-flex translate-y-[5px] items-center transition-[translate,margin] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] group-hover:mx-[5px] group-hover:translate-y-[7px]">
              <For each={asoman()}>
                {(r, i) => (
                  <span
                    class="-ml-1.5 grid size-[15px] translate-y-[var(--sube)] place-items-center rounded-full border border-border-strong bg-surface-raised shadow-[0_0_0_1.5px_var(--color-bg)] transition-[width,height,margin,translate,box-shadow] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] first:ml-0 group-hover:ml-1 group-hover:size-[19px] group-hover:translate-y-0 group-hover:shadow-[0_0_0_2px_var(--color-bg),0_2px_6px_rgba(10,13,35,.12)] group-hover:first:ml-0 [&>svg]:size-[62%]"
                    style={{ "--sube": `${-3 * Math.min(i(), 3)}px` }}
                    title={r.nombre}
                  >
                    {r.icono}
                  </span>
                )}
              </For>
            </span>
          </Show>
          <ArrowRight
            size={14}
            aria-hidden="true"
            class={cn(
              "ml-0.5 transition-[translate,rotate] duration-200",
              props.abierto ? "ml-1.5 -rotate-90" : "group-hover:translate-x-[3px]",
            )}
          />
        </span>
      </Pressable>
    </Show>
  );
}
