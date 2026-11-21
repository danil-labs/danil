import { MarcaAgente } from "../../../ui/src/icons";

/** Known launch metadata only: a reference is not a discovered native task. */
export function DelegatedReference(props: { id: string; title: string; provider: string }) {
  return <div data-delegated-reference={props.id} class="flex h-[52px] min-w-0 flex-col justify-center rounded-[10px] px-2.5 py-[7px]">
    <div class="task-card-lines">
      <div class="task-card-main">
        <div class="task-card-title flex h-[22px] min-w-0 items-center gap-1.5"><span class="min-w-0 truncate text-[0.84375rem] leading-[18px]">{props.title}</span></div>
        <div class="task-card-metadata text-xs font-normal leading-4 text-neutral-500">
          <span class="task-card-provider" title={props.provider} aria-label={props.provider}><MarcaAgente id={props.provider} size={13} /></span>
        </div>
      </div>
    </div>
  </div>;
}
