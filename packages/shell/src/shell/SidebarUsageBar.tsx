import AlertTriangle from "lucide-solid/icons/triangle-alert";
import { createMemo, createSignal, For, Show } from "solid-js";
import { immediateWindow } from "../../../ui/src/lib/account-usage.ts";
import { t } from "../../../ui/src/lib/i18n";
import { left, legible } from "../../../ui/src/lib/limits";
import { type Agent } from "../../../ui/src/lib/model.ts";
import { isRetiredAgent } from "../../../ui/src/lib/tasks/index.ts";
import { cn } from "../../../ui/src/lib/utils";
import { MarcaAgente } from "../../../ui/src/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";
import { hasDanilCreditsCapability, UsagePanel, useDanilCreditsStatus } from "./UsageTool";
import { type ActiveCard, type Usage, usageKey } from "./usage";

const RING_R = 4.6;
const RING_C = 2 * Math.PI * RING_R;

function ringToneClass(remaining: number): string {
  if (remaining <= 5) return "text-error-strong";
  if (remaining <= 20) return "text-warning-strong";
  return "text-success-strong";
}

/** Mini circular progress ring badge placed on the top-right corner of a provider icon. */
function QuotaRing(props: { remaining: number; stale?: boolean }) {
  const offset = () => RING_C * (1 - Math.max(0, Math.min(100, props.remaining)) / 100);
  return (
    <span
      class={cn(
        "pointer-events-none absolute -top-0.5 -right-0.5 grid size-[11px] place-items-center rounded-full bg-surface",
        props.stale && "opacity-60",
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" class="size-[11px] -rotate-90">
        <circle
          cx="6"
          cy="6"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="text-neutral-500/25"
        />
        <circle
          cx="6"
          cy="6"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-dasharray={`${RING_C}`}
          stroke-dashoffset={`${offset()}`}
          class={ringToneClass(props.remaining)}
        />
      </svg>
    </span>
  );
}

/**
 * Compact AI providers & quota strip pinned to the bottom of the left sidebar:
 * connected providers render in full color with a top-right circular quota ring;
 * unconnected providers appear dimmed; clicking any icon opens the full UsagePanel popover above.
 */
export default function SidebarUsageBar(props: {
  usage: Usage;
  agent: string;
  agents: readonly Agent[];
  onManage: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null);
  const showCredits = () => hasDanilCreditsCapability();
  const credits = useDanilCreditsStatus(showCredits);

  const cardRead = (card: ActiveCard) => {
    const k = usageKey(card.agent, card.cuenta.id);
    const fresh = legible(props.usage.reads()[k]);
    if (fresh) return { read: fresh, stale: false };
    const old = props.usage.lastGoodReads()[k];
    return old ? { read: old, stale: true } : null;
  };

  const cardRemaining = (card: ActiveCard) => {
    const w = immediateWindow(cardRead(card)?.read.windows ?? []);
    return w ? left(w) : null;
  };

  const cardFailed = (card: ActiveCard) => {
    if (cardRead(card)) return false;
    const mode = props.usage.reads()[usageKey(card.agent, card.cuenta.id)]?.mode;
    return mode === "failed" || mode === "revoked" || mode === "waiting";
  };

  const disconnectedAgents = createMemo(() => {
    const connected = new Set(props.usage.activeCards().map((c) => c.agent));
    return props.agents.filter((a) => !isRetiredAgent(a.id) && !connected.has(a.id));
  });

  const hasAny = () => props.usage.activeCards().length > 0 || disconnectedAgents().length > 0 || showCredits();
  const focusedAgent = () => selectedAgent() ?? props.agent;

  const openFor = (agentId: string) => {
    if (open() && selectedAgent() === agentId) {
      setOpen(false);
      return;
    }
    setSelectedAgent(agentId);
    setOpen(true);
  };

  return (
    <Show when={hasAny()}>
      <div
        data-sidebar-usage-bar=""
        class="shrink-0 border-t border-border px-2.5 py-1.5"
      >
        <Popover open={open()} onOpenChange={setOpen} placement="top-start">
          <PopoverTrigger
            as={(trigger: object) => (
              <div
                {...trigger}
                role="group"
                aria-label={t("usage.bar.aria")}
                class="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onClick={(e: MouseEvent) => {
                  // Only buttons inside toggle; ignore clicks on empty gap.
                  if (e.target === e.currentTarget) e.stopPropagation();
                }}
              >
                <For each={props.usage.activeCards()}>
                  {(card) => {
                    const remaining = () => cardRemaining(card);
                    const failed = () => cardFailed(card);
                    const stale = () => Boolean(cardRead(card)?.stale);
                    const title = () => {
                      const pct = remaining();
                      return pct !== null
                        ? t("usage.tool.title", { agent: card.label, left: pct })
                        : card.label;
                    };
                    return (
                      <Pressable
                        data-provider-usage={card.agent}
                        aria-label={title()}
                        title={title()}
                        aria-pressed={open() && selectedAgent() === card.agent}
                        class={cn(
                          "relative grid size-7 shrink-0 place-items-center rounded-md text-neutral-950 transition-colors hover:bg-neutral-200/70 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                          open() && selectedAgent() === card.agent && "bg-neutral-200/80",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          openFor(card.agent);
                        }}
                      >
                        <MarcaAgente id={card.agent} size={16} />
                        <Show when={remaining() !== null}>
                          <QuotaRing remaining={remaining()!} stale={stale()} />
                        </Show>
                        <Show when={remaining() === null && failed()}>
                          <span
                            class="pointer-events-none absolute -top-0.5 -right-0.5 grid size-[11px] place-items-center rounded-full bg-surface text-warning-strong"
                            aria-hidden="true"
                          >
                            <AlertTriangle size={9} />
                          </span>
                        </Show>
                      </Pressable>
                    );
                  }}
                </For>

                <Show when={showCredits()}>
                  {(() => {
                    const title = () => t("usage.tool.credits_title", { balance: credits.label() });
                    return (
                      <Pressable
                        data-provider-usage="danil"
                        aria-label={title()}
                        title={title()}
                        aria-pressed={open() && selectedAgent() === "danil"}
                        class={cn(
                          "relative grid size-7 shrink-0 place-items-center rounded-md text-neutral-950 transition-colors hover:bg-neutral-200/70 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                          open() && selectedAgent() === "danil" && "bg-neutral-200/80",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          openFor("danil");
                        }}
                      >
                        <MarcaAgente id="danil" size={16} />
                        <Show when={(credits.amount() ?? 0) > 0}>
                          <QuotaRing remaining={100} />
                        </Show>
                      </Pressable>
                    );
                  })()}
                </Show>

                <For each={disconnectedAgents()}>
                  {(agent) => (
                    <Pressable
                      data-provider-usage={agent.id}
                      data-provider-disconnected=""
                      aria-label={agent.label}
                      title={agent.label}
                      class="relative grid size-7 shrink-0 place-items-center rounded-md text-neutral-500 opacity-45 grayscale transition-all hover:bg-neutral-200/70 hover:opacity-85 hover:grayscale-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFor(agent.id);
                      }}
                    >
                      <MarcaAgente id={agent.id} size={16} />
                    </Pressable>
                  )}
                </For>
              </div>
            )}
          />
          <PopoverContent class="flex max-h-[min(460px,70vh)] w-[320px] flex-col overflow-hidden p-0">
            <UsagePanel
              usage={props.usage}
              agent={focusedAgent()}
              onManage={() => {
                setOpen(false);
                props.onManage();
              }}
              onClose={() => setOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </Show>
  );
}
