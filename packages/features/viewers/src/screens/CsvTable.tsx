import { For, Show, createMemo } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { parseTable } from "../../../../ui/src/lib/csv";

/**
 * Un `.csv` o `.tsv` como tabla. La primera fila es la de encabezados: es la
 * convención de una hoja exportada, y sin ella la tabla no tiene cómo nombrar
 * sus columnas.
 */
export default function DelimitedTable(props: { text: string; delim: string }) {
  const table = createMemo(() => parseTable(props.text, props.delim));
  const header = () => table().rows[0] ?? [];
  const body = () => table().rows.slice(1);

  return (
    <div class="flex h-full min-h-0 flex-col">
      <Show
        when={table().rows.length > 0}
        fallback={
          <p class="m-0 p-4 text-xs text-neutral-500">{t("code.file.table.empty")}</p>
        }
      >
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full border-collapse font-mono text-caption">
            <thead>
              <tr>
                <For each={header()}>
                  {(cell) => (
                    <th class="sticky top-0 border-b border-r border-border bg-surface-raised px-2 py-1 text-left font-semibold whitespace-nowrap">
                      {cell}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={body()}>
                {(row) => (
                  <tr class="odd:bg-surface-muted">
                    <For each={row}>
                      {(cell) => (
                        <td class="border-b border-r border-border px-2 py-1 align-top whitespace-pre-wrap">
                          {cell}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={table().truncated}>
          <p class="m-0 border-t border-border bg-surface-raised px-3 py-1.5 text-caption text-neutral-500">
            {t("code.file.table.truncated")}
          </p>
        </Show>
      </Show>
    </div>
  );
}
