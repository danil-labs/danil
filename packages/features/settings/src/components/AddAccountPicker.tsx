import { For, Match, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { Button } from "../../../../ui/src/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuItem, DropdownMenuTrigger } from "../../../../ui/src/DropdownMenu";
import { MarcaAgente } from "../../../../ui/src/icons";
import type { OpcionDeAlta } from "../model/ai-providers-groups";

/**
 * El único «Agregar cuenta» de Proveedores de IA: un menú con un renglón por
 * proveedor. No decide nada: cada opción ya trae de `opcionesDeAlta` si se
 * agrega, si solo abre el grupo (descarga externa) o por qué no se puede, y
 * ese motivo se lee en el renglón, no en un `title`.
 */
export default function AddAccountPicker(props: {
  opciones: OpcionDeAlta[];
  nombre: (id: string) => string;
  onElegir: (id: string) => void;
  disabled?: boolean;
  disparador?: (el: HTMLButtonElement) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={Button} ref={props.disparador} variant="primary" size="sm" disabled={props.disabled} data-add-account="">
        {t("settings.accounts.add")}
      </DropdownMenuTrigger>
      {/* Configuración es un Dialog en z-[80] que cierra con Esc salvo dentro de data-owns-escape. */}
      <DropdownMenuContent class="z-[90] max-w-80" data-owns-escape data-add-account-menu="">
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel>{t("settings.ai_providers.pick_provider")}</DropdownMenuGroupLabel>
          <For each={props.opciones}>
            {(o) => (
              <DropdownMenuItem class="flex items-start gap-2" disabled={o.accion === "bloqueada"} onSelect={() => props.onElegir(o.id)} data-add-option={o.id}>
                <span class="flex size-4 shrink-0 items-center justify-center pt-0.5"><MarcaAgente id={o.id} size={16} /></span>
                <span class="grid min-w-0 gap-0.5">
                  <span class="truncate">{props.nombre(o.id)}</span>
                  <Switch>
                    <Match when={o.accion === "bloqueada" && o.motivo === "segunda" ? o : null}>
                      {(b) => <span class="text-xs text-neutral-500 whitespace-normal">{prosa(b().porque)} {t("settings.accounts.shared_remove_first")}</span>}
                    </Match>
                    <Match when={o.accion === "bloqueada"}>
                      <span class="text-xs text-neutral-500">{t("settings.accounts.busy")}</span>
                    </Match>
                  </Switch>
                </span>
              </DropdownMenuItem>
            )}
          </For>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
