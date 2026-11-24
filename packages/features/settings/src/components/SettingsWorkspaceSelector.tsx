import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { capabilities } from "../../../../host/src/platform";
import { FailureNote, type Failure } from "../../../../ui/src/Failure";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import type { SesionesDeAjustes } from "../model/sessions-port";
import {
  type SettingsWorkspaceOption,
  workspaceMetadataLabel,
} from "../model/settings-workspaces";

export function SettingsWorkspaceSelector(props: {
  options: readonly SettingsWorkspaceOption[];
  active: SettingsWorkspaceOption | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: SettingsWorkspaceOption) => void;
  failure?: Failure | null;
  sesiones: SesionesDeAjustes;
  class?: string;
}) {
  const { MarcaDeWorkspace, organizationLogo } = props.sesiones;

  const metadataLabels = () => ({
    personal: t("settings.workspace_selector.personal"),
    local: t("settings.workspace_selector.local"),
    expired: t("settings.workspace_selector.expired"),
    planFree: t("settings.workspace_selector.plan_free"),
    planBusiness: t("settings.workspace_selector.plan_business"),
  });

  const metadataOf = (option: SettingsWorkspaceOption) =>
    workspaceMetadataLabel(option, metadataLabels());

  const logoLoaderFor = (option: SettingsWorkspaceOption): (() => Promise<string | null>) | undefined => {
    if (option.otherAccount) return option.otherAccount.loadLogo;
    if (capabilities().nativeWindow && option.context && option.logo && organizationLogo) {
      const ctx = option.context;
      const id = option.id;
      const logo = option.logo;
      return () => organizationLogo(ctx, id, logo);
    }
    return undefined;
  };

  function onMenuKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onOpenChange(false);
      return;
    }
    const list = e.currentTarget as HTMLElement;
    const buttons = [...list.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % buttons.length;
    else if (e.key === "ArrowUp") next = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      buttons[next]?.focus();
    }
  }

  function select(option: SettingsWorkspaceOption) {
    props.onOpenChange(false);
    props.onSelect(option);
  }

  const canSwitch = () => props.options.length > 1;

  return (
    <Show when={props.active}>
      {(current) => (
        <div class={cn("min-w-0", props.class)} data-settings-workspace-selector="">
          <Show
            when={canSwitch()}
            fallback={
              <div
                data-settings-workspace-static=""
                class="flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-neutral-950"
              >
                <span
                  aria-hidden="true"
                  class="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-sm bg-neutral-200 text-caption font-semibold text-neutral-950"
                >
                  <MarcaDeWorkspace
                    id={current().id}
                    name={current().name}
                    logo={current().logo}
                    load={logoLoaderFor(current())}
                  />
                </span>
                <span class="grid min-w-0 flex-1 gap-0.5">
                  <span class="truncate text-ui font-semibold leading-tight text-neutral-950">
                    {current().name}
                  </span>
                  <Show when={metadataOf(current())}>
                    {(meta) => (
                      <span class="truncate text-caption leading-tight text-neutral-500">
                        {meta()}
                      </span>
                    )}
                  </Show>
                </span>
              </div>
            }
          >
            <Popover
              open={props.open}
              onOpenChange={props.onOpenChange}
              placement="bottom-start"
              gutter={6}
            >
              <PopoverTrigger
                type="button"
                data-settings-workspace-trigger=""
                aria-label={t("settings.workspace_selector.label")}
                class="flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-neutral-950 transition-colors outline-none hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted focus-visible:outline-none data-[expanded]:bg-surface-muted"
              >
                <span
                  aria-hidden="true"
                  class="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-sm bg-neutral-200 text-caption font-semibold text-neutral-950"
                >
                  <MarcaDeWorkspace
                    id={current().id}
                    name={current().name}
                    logo={current().logo}
                    load={logoLoaderFor(current())}
                  />
                </span>
                <span class="grid min-w-0 flex-1 gap-0.5">
                  <span class="truncate text-ui font-semibold leading-tight text-neutral-950">
                    {current().name}
                  </span>
                  <Show when={metadataOf(current())}>
                    {(meta) => (
                      <span class="truncate text-caption leading-tight text-neutral-500">
                        {meta()}
                      </span>
                    )}
                  </Show>
                </span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  class={cn(
                    "shrink-0 text-neutral-500 transition-transform",
                    props.open && "rotate-180",
                  )}
                />
              </PopoverTrigger>
              <PopoverContent
                data-owns-escape=""
                data-settings-workspace-menu=""
                class="w-[var(--kb-popper-anchor-width,240px)] min-w-[228px] max-w-[300px] p-1.5"
              >
                <p class="m-0 px-2 pt-1 pb-1.5 text-caption font-medium text-neutral-500">
                  {t("settings.workspace_selector.heading")}
                </p>
                <div
                  role="listbox"
                  aria-label={t("settings.workspace_selector.heading")}
                  onKeyDown={onMenuKeyDown}
                  class="flex max-h-64 flex-col gap-0.5 overflow-y-auto"
                >
                  <For each={props.options}>
                    {(option) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.active}
                        data-settings-workspace-option={option.id}
                        data-workspace-context={option.context ?? undefined}
                        class={cn(
                          "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-neutral-950 transition-colors outline-none hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted focus-visible:outline-none",
                          option.active && "bg-surface-muted font-medium",
                          option.otherAccount && !option.otherAccount.signedIn && "opacity-65",
                        )}
                        onClick={() => select(option)}
                      >
                        <span
                          aria-hidden="true"
                          class="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-sm bg-neutral-200 text-caption font-semibold text-neutral-950"
                        >
                          <MarcaDeWorkspace
                            id={option.id}
                            name={option.name}
                            logo={option.logo}
                            load={logoLoaderFor(option)}
                          />
                        </span>
                        <span class="grid min-w-0 flex-1 gap-0.5">
                          <span class="truncate text-ui leading-tight text-neutral-950">
                            {option.name}
                          </span>
                          <Show when={metadataOf(option)}>
                            {(meta) => (
                              <span class="truncate text-caption leading-tight text-neutral-500">
                                {meta()}
                              </span>
                            )}
                          </Show>
                        </span>
                        <Show when={option.active}>
                          <Check size={14} class="shrink-0 text-neutral-950" aria-hidden="true" />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </PopoverContent>
            </Popover>
          </Show>
          <Show when={props.failure}>
            {(f) => (
              <div class="mt-2">
                <FailureNote f={f()} />
              </div>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}
