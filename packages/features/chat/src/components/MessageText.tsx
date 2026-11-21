import { Index, Show } from "solid-js";
import { claseDelTramo, type TaskMention, tramosDelMensaje } from "./mentions.ts";
import { Markdown } from "../../../../ui/src/Markdown.tsx";
import { WithMentions } from "./WithMentions.tsx";

export type Marcas = {
  taskMentions?: TaskMention[];
  commands?: ReadonlySet<string>;
  skills?: ReadonlySet<string>;
  onOpenTask?: (folder: string, task: string) => void;
};

const SIN_COMANDOS: ReadonlySet<string> = new Set();
const SIN_SKILLS: ReadonlySet<string> = new Set();

/** El comando inicial y las skills como chips; las menciones, como entidades. */
function Tramos(props: Marcas & { text: string }) {
  // Las menciones cuentan desde el principio del mensaje; el tramo sin comando empieza más adelante.
  const desde = (resto: string) => {
    const corte = props.text.length - resto.length;
    return props.taskMentions
      ?.filter((x) => x.start >= corte)
      .map((x) => ({ ...x, start: x.start - corte, end: x.end - corte }));
  };
  return (
    <Index each={tramosDelMensaje(props.text, props.commands ?? SIN_COMANDOS, props.skills ?? SIN_SKILLS)}>
      {(tramo) => (
        <Show
          when={tramo().kind}
          fallback={
            <WithMentions taskMentions={desde(tramo().text)} onOpenTask={props.onOpenTask}>
              {tramo().text}
            </WithMentions>
          }
        >
          {(kind) => (
            <span data-kind={kind()} class={claseDelTramo(kind(), "enviado")}>
              {tramo().text}
            </span>
          )}
        </Show>
      )}
    </Index>
  );
}

/** Las menciones que aparecen en un texto del Markdown, con posiciones de ese texto. */
function mencionesEn(texto: string, todas: TaskMention[] | undefined): TaskMention[] {
  return (todas ?? [])
    .flatMap((m) => {
      const start = texto.indexOf(m.text);
      return start < 0 ? [] : [{ ...m, start, end: start + m.text.length }];
    })
    .sort((a, b) => a.start - b.start);
}

/** El texto de un mensaje de la persona, o en Markdown el de un agente o de otra tarea. */
export function MessageText(
  props: Marcas & { text: string; searchBlock?: number; incoming: boolean },
) {
  const texto = (valor: string, inicio: boolean) => (
    <Tramos
      text={valor}
      commands={inicio && props.text.startsWith(valor) ? (props.commands ?? SIN_COMANDOS) : SIN_COMANDOS}
      skills={props.skills ?? SIN_SKILLS}
      taskMentions={mencionesEn(valor, props.taskMentions)}
      onOpenTask={props.onOpenTask}
    />
  );
  return (
    <Show
      when={props.incoming}
      fallback={
        <p data-thread-search-text={props.searchBlock} class="m-0 leading-[1.5] break-words whitespace-pre-wrap">
          <Tramos
            text={props.text}
            commands={props.commands ?? SIN_COMANDOS}
            skills={props.skills ?? SIN_SKILLS}
            taskMentions={props.taskMentions}
            onOpenTask={props.onOpenTask}
          />
        </p>
      }
    >
      <div data-thread-search-text={props.searchBlock}>
        <Markdown texto={texto}>{props.text}</Markdown>
      </div>
    </Show>
  );
}
export default MessageText;
