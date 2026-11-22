import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { previewFile, setWorkspaceLogo, setWorkspaceLogoPng } from "../queries/engine-workspaces";
import { open } from "@tauri-apps/plugin-dialog";
import ImagePlus from "lucide-solid/icons/image-plus";
import { Button } from "../../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { MarcaDeWorkspace } from "../../../../shell/src/shell/WorkspaceColumn";
import { LogoCrop } from "./LogoCrop";
import { imagenInerte } from "../../../../../apps/desktop/src/lib/links";
import { anunciarRenombrado, type Workspace } from "../queries/workspaces-store";
import { capabilities } from "../../../../host/src/platform";
import { elegirArchivoDeImagen } from "../../../../host/src/pick-image";
import { blobToDataUrl } from "../model/account-profile";

const IMAGENES_DE_LOGO = ["png", "jpg", "jpeg", "webp"];

const pngDeBase64 = (base64: string) => new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "image/png" });

/**
 * El logo que pinta la columna y el menú del nombre. Se copia dentro del
 * workspace: la carpeta elegida puede no estar mañana. `fila` es la de Estilo;
 * sin ella va metida en la tarjeta del workspace. En la web, el de un
 * workspace de la cuenta se elige con el selector de la página y se guarda en
 * la cuenta (`capabilities().accountAssets`).
 */
export function LogoDelWorkspace(props: {
  workspace: Workspace;
  onCambio: () => void;
  fila?: boolean;
}) {
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [recorte, setRecorte] = createSignal<string | null>(null);
  const cuenta = capabilities().accountAssets;
  const [version, setVersion] = createSignal(0);
  /* Sin `createResource`: suspendería el panel de Estilo entero, y en la web
     cada relectura de la lista de computadoras del borde trae otro objeto del workspace y lo
     dejaría en blanco. Se relee solo si cambia el id o se guardó un logo. */
  const [logoDeLaCuenta, setLogoDeLaCuenta] = createSignal<string | null | undefined>();
  createEffect(
    on([() => props.workspace.id, version], ([id]) => {
      if (!cuenta) return;
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void cuenta.read(id, "logo").then(
        (logo) => vivo && setLogoDeLaCuenta(logo),
        () => vivo && setLogoDeLaCuenta(undefined),
      );
    }),
  );
  const tieneLogo = () => !!props.workspace.logo || !!logoDeLaCuenta();
  const cambiado = () => {
    setVersion((n) => n + 1);
    anunciarRenombrado();
    props.onCambio();
  };

  async function quitar() {
    setGuardando(true);
    setFallo(null);
    try {
      if (!(cuenta && (await cuenta.remove(props.workspace.id, "logo"))))
          await setWorkspaceLogo({ id: props.workspace.id, source: null });
      cambiado();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  async function usar(pngBase64: string) {
    setGuardando(true);
    setFallo(null);
    try {
      if (!(cuenta && (await cuenta.put(props.workspace.id, "logo", pngDeBase64(pngBase64)))))
        await setWorkspaceLogoPng({ id: props.workspace.id, pngBase64 });
      setRecorte(null);
      cambiado();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  async function elegir() {
    if (cuenta) {
      const file = await elegirArchivoDeImagen(IMAGENES_DE_LOGO);
      if (!file) return;
      setFallo(null);
      const src = imagenInerte(await blobToDataUrl(file).catch(() => null));
      if (!src) return setFallo({ what: "settings.workspaces.logo.unreadable", detail: "" });
      setRecorte(src);
      return;
    }
    const chosen = await open({
      multiple: false,
      directory: false,
      title: t("settings.workspaces.logo.title"),
      filters: [{ name: t("settings.workspaces.logo.images"), extensions: IMAGENES_DE_LOGO }],
    });
    if (typeof chosen !== "string") return;
    setGuardando(true);
    setFallo(null);
    try {
      const visto = await previewFile<{ data_url: string | null }>({
        path: chosen,
        rel: chosen,
      });
      const src = imagenInerte(visto.data_url);
      if (!src) {
        setFallo({ what: "settings.workspaces.logo.unreadable", detail: "" });
        return;
      }
      setRecorte(src);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  const marca = (tamano: string) => (
    <span
      aria-hidden="true"
      class={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface font-semibold text-neutral-700 ${tamano}`}
    >
      <MarcaDeWorkspace id={props.workspace.id} name={props.workspace.name} logo={props.workspace.logo} />
    </span>
  );
  const acciones = (
    <>
      <Button size="sm" variant="outline" disabled={guardando()} onClick={() => void elegir()}>
        <ImagePlus size={14} />
        {tieneLogo()
          ? t("settings.workspaces.logo.change")
          : t("settings.workspaces.logo.pick")}
      </Button>
      <Show when={tieneLogo()}>
        <Button size="sm" variant="ghost" disabled={guardando()} onClick={() => void quitar()}>
          {t("settings.workspaces.logo.clear")}
        </Button>
      </Show>
    </>
  );
  const dialogo = (
    <LogoCrop
      src={recorte()}
      saving={guardando()}
      onCancel={() => setRecorte(null)}
      onUse={(png) => void usar(png)}
    />
  );

  return (
    <Show
      when={props.fila}
      fallback={
        <div class="grid gap-1 pl-[27px] text-xs">
          <span class="text-neutral-500">{t("settings.workspaces.logo.title")}</span>
          <div class="flex items-center gap-2">
            {marca("size-10 text-body")}
            {acciones}
          </div>
          <p class="m-0 text-neutral-500">{t("settings.workspaces.logo.hint")}</p>
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
          {dialogo}
        </div>
      }
    >
      <SettingsRow
        lead={marca("size-8 text-label")}
        label={t("settings.workspaces.logo.title")}
        description={t("settings.workspaces.logo.hint")}
      >
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-2">{acciones}</div>
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
        </div>
        {dialogo}
      </SettingsRow>
    </Show>
  );
}
