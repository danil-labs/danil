import { createSignal, onMount, Show } from "solid-js";
import { setMemoryProvider } from "../queries/engine-accounts";
import { listWorkspaces } from "../queries/engine-workspaces";
import { Button } from "../../../../ui/src/Button";
import { Textarea } from "../../../../ui/src/Textarea";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { t } from "../../../../ui/src/lib/i18n";
import type { MemoriaProveedor, Startup } from "../queries/workspaces-store";
import { Input } from "../../../../ui/src/Input";

/**
 * El hueco de proveedor de memoria por workspace: local, o un servidor MCP
 * externo bajo el nombre reservado `terminus-memory`, inyectado en cada turno
 * sin pasar por `mcp.json`. Volver a local no borra las entradas en disco:
 * dejan de leerse y ofrecerse, y el texto lo dice para que no se sienta como
 * una pérdida.
 */
export default function ProveedorDeMemoria() {
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  const [proveedor, setProveedor] = createSignal<MemoriaProveedor>({ tipo: "local" });
  const [block, setBlock] = createSignal("");
  const [readWrite, setReadWrite] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  function cargar() {
    void listWorkspaces<Startup>().then((s) => {
      const activo = s.workspaces.find((w) => w.id === s.active);
      if (!activo) return;
      setWorkspace(activo.id);
      setProveedor(activo.memoria);
      if (activo.memoria.tipo === "mcp_externo") {
        setReadWrite(activo.memoria.lectura_escritura);
      }
    }).catch(() => {});
  }
  onMount(cargar);

  /** El proveedor externo, o `null` si es local. Evita repetir el cast. */
  const externo = () => {
    const p = proveedor();
    return p.tipo === "mcp_externo" ? p : null;
  };

  async function activarExterno() {
    const id = workspace();
    if (!id || !block().trim()) return;
    setSaving(true);
    setFallo(null);
    try {
      const w = await setMemoryProvider<{ memoria: MemoriaProveedor }>({
        id,
        block: block(),
        readWrite: readWrite(),
      });
      setProveedor(w.memoria);
      setBlock("");
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setSaving(false);
    }
  }

  async function volverALocal() {
    const id = workspace();
    if (!id) return;
    setSaving(true);
    setFallo(null);
    try {
      const w = await setMemoryProvider<{ memoria: MemoriaProveedor }>({
        id,
        block: null,
        readWrite: true,
      });
      setProveedor(w.memoria);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="grid grid-cols-[minmax(0,1fr)] gap-2">
      <h3 class="m-0 text-ui font-semibold">{t("settings.memory.title")}</h3>
      <p class="m-0 text-xs text-neutral-500">{t("settings.memory.hint")}</p>

      <Show
        when={externo()}
        fallback={
          <div class="grid gap-2 rounded-md border border-border bg-surface-raised p-3">
            <Textarea
              rows={4}
              class="font-mono text-caption"
              placeholder={t("settings.memory.paste_hint")}
              value={block()}
              onInput={(e) => setBlock(e.currentTarget.value)}
            />
            <label class="flex items-center gap-2 text-xs">
              <Input
                variant="plain"
                type="checkbox"
                checked={readWrite()}
                onChange={(e) => setReadWrite(e.currentTarget.checked)}
              />
              {t("settings.memory.read_write")}
            </label>
            <div class="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!block().trim() || saving()}
                onClick={() => void activarExterno()}
              >
                {saving() ? t("settings.memory.saving") : t("settings.memory.activate")}
              </Button>
            </div>
          </div>
        }
      >
        {(e) => (
          <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5">
            <span class="text-xs text-neutral-500">
              {t("settings.memory.external_on", {
                access: e().lectura_escritura
                  ? t("settings.memory.read_write")
                  : t("settings.memory.read_only"),
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving()}
              onClick={() => void volverALocal()}
            >
              {t("settings.memory.revert")}
            </Button>
          </div>
        )}
      </Show>

      <Show when={externo()}>
        <p class="m-0 text-xs text-neutral-500">{t("settings.memory.local_kept")}</p>
      </Show>

      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </section>
  );
}
