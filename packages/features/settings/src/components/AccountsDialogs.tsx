import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import { Show } from "solid-js";
import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { cancelLogin, discardAccount } from "../queries/engine-accounts";
import { openExternal } from "../queries/engine-open";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Input } from "../../../../ui/src/Input";
import { Terminal, TerminalBody } from "../../../../ui/src/Terminal";
import { LoginCodeForm } from "../screens/LoginCodeForm";
import { Spinner } from "../../../../ui/src/Spinner";
import { ExternalLink as EnlaceExterno } from "../../../../ui/src/ExternalLink";
import { Paso } from "./ConnectionStep";
import type { createCuentas } from "./AccountsState";
import type { createConexionDeCuentas } from "./AccountsConnect";
import type { createAccionesDeCuentas } from "./AccountsActions";
import type { createPartesDeCuentas } from "./AccountsParts";

export function createDialogosDeCuentas(cuentas: ReturnType<typeof createCuentas>, conexion: ReturnType<typeof createConexionDeCuentas>, acciones: ReturnType<typeof createAccionesDeCuentas>, partes: ReturnType<typeof createPartesDeCuentas>) {
  const { enCurso, instalando, url, pideCodigo, porConfirmar, enlaceCopiado, copiaFallida, codigo, setCodigo, salida, ofrecerTerminal, machineOf, agente } = cuentas;
  const { etiqueta, acto, terminalLocal, conectar, pidiendoClave, setPidiendoClave, setClave, refrescar, claveDe, clave, guardarClave, guardandoClave } = conexion;
  const { copiarEnlace, enviarCodigo } = acciones;
  const { cancelarConexion } = partes;
  const DialogoDeClave = () => (
    <Show when={enCurso()}>
      {(id) => (
        <Dialog open onOpenChange={(abierto) => !abierto && cancelarConexion()}>
          {/* Sin `onClick` de cierre en el velo, a diferencia de `Consentir`:
              un clic fuera no puede tirar una autenticación a medias que
              además tiene un proceso vivo detrás. Se sale por «cancelar»,
              que sí mata el proceso (`cancel_login`). */}
            <DialogContent
              class="flex w-[min(520px,100%)] max-w-[520px] flex-col gap-4 p-5"
              aria-label={t("settings.accounts.connect_agent", { agent: etiqueta() })}
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle class="text-sm font-semibold">
                    {t("settings.accounts.connect_agent", { agent: etiqueta() })}
                  </DialogTitle>
                  {/* Bajar el CLI tarda, y se dice: sin esto la conexión parece
                      colgada durante la descarga, el momento en que nadie sabe si
                      pasa algo. */}
                  <Show when={instalando() || (!url() && !pideCodigo() && !porConfirmar())}>
                    <span class="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Spinner size={12} />
                      {instalando() ? acto().curso : t("settings.accounts.connecting")}
                    </span>
                  </Show>
                </div>
                <Button variant="outline" size="compact" onClick={cancelarConexion}>
                  {t("settings.accounts.cancel")}
                </Button>
              </div>

              {/* El código que la página va a pedir, delante de todo. No es un
                  detalle del registro: la página dice «enter the code shown in
                  your terminal» y aquí no hay terminal — sin esto se llega a
                  una pantalla que pide algo que la app se guardó. */}
              <Show when={porConfirmar()}>
                {(c) => (
                  <div class="flex flex-col gap-1.5 text-xs text-neutral-500">
                    <span>{t("settings.accounts.confirm_code")}</span>
                    <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-xl font-semibold tracking-[0.08em] text-neutral-950">{c()}</strong>
                  </div>
                )}
              </Show>

              {/* Copiar el enlace: dentro del registro sale partido en renglones. */}
              <Show when={url()}>
                {(u) => (
                  <Paso numero={1} titulo={t("settings.accounts.step_browser")}>
                    <p class="m-0 text-xs text-neutral-500">
                      {t("settings.accounts.step_browser_hint", { agent: etiqueta() })}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openExternal({ target: u() }).catch(() => {})}
                      >
                        <ExternalLink size={14} />
                        {t("settings.accounts.open_browser")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void copiarEnlace(u())}>
                        <Show when={enlaceCopiado()} fallback={<Copy size={14} />}>
                          <Check size={14} />
                        </Show>
                        {enlaceCopiado()
                          ? t("settings.accounts.link_copied")
                          : t("settings.accounts.copy_link")}
                      </Button>
                    </div>
                    <Show when={copiaFallida()}>
                      {(m) => <p class="m-0 text-xs text-error-strong">{m()}</p>}
                    </Show>
                  </Paso>
                )}
              </Show>

              <Show when={pideCodigo()}>
                <Paso numero={url() ? 2 : 1} titulo={t("settings.accounts.step_code")}>
                  <LoginCodeForm value={codigo()} onInput={setCodigo} onSubmit={() => void enviarCodigo()} />
                </Paso>
              </Show>

              {/* Lo que el agente va diciendo, tal cual: cuando una conexión
                  falla, el motivo está ahí y esconderlo obliga a adivinar.
                  Plegado: el fallo final ya lo pinta `conexionFallida`. */}
              <Show when={salida().length > 0}>
                <details class="group">
                  <summary class="flex cursor-pointer list-none items-center gap-1 text-xs text-neutral-500 marker:content-none hover:text-neutral-950">
                    <ChevronRight size={12} class="transition-transform group-open:rotate-90" />
                    {t("settings.accounts.log", { agent: etiqueta() })}
                  </summary>
                  <Terminal class="mt-2">
                    <TerminalBody class="max-h-[140px] break-all">{salida().join("\n")}</TerminalBody>
                  </Terminal>
                </details>
              </Show>

              {/* El agente lleva un rato sin decir nada. Puede ser que esté
                  esperando algo que solo sabe pedir con una terminal de verdad, y
                  esto es lo único que lo destraba. */}
              <Show when={ofrecerTerminal() && terminalLocal(id())}>
                <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span>
                    {t("settings.accounts.no_response", { agent: etiqueta() })}
                  </span>
                  <Button
                    variant="outline"
                    size="compact"
                    onClick={() => {
                      cancelLogin({ id: id() }, machineOf(id())).catch(() => {});
                      void conectar(id(), "terminal");
                    }}
                  >
                    {t("settings.accounts.open_terminal")}
                  </Button>
                </div>
              </Show>
            </DialogContent>
        </Dialog>
      )}
    </Show>
  );
  const DialogoDeConfirmacion = () => (
    <Show when={pidiendoClave()}>
      <Dialog open>
      <DialogContent
        class="w-[min(560px,100%)] max-w-[560px] p-0"
        aria-label={t("settings.accounts.connect_agent", { agent: etiqueta() })}
      >
      <div class="flex flex-col gap-2 rounded-md border border-primary px-3 py-2.5">
        <div class="flex items-center justify-between text-xs font-semibold">
          <DialogTitle>{t("settings.accounts.connect_agent", { agent: etiqueta() })}</DialogTitle>
          <Button
            variant="outline"
            size="compact"
            onClick={() => {
              const id = pidiendoClave();
              setPidiendoClave(null);
              setClave("");
              // El alta creó la cuenta antes de tener la clave, igual que con
              // el login del CLI. Sin esto queda un objeto vacío en la lista.
              if (id) void discardAccount({ provider: agente(), id }, machineOf(id)).then(refrescar);
            }}
          >
            {t("settings.accounts.cancel")}
          </Button>
        </div>
        <EnlaceExterno url={claveDe()}>
          {t("settings.accounts.create_key")}
        </EnlaceExterno>
        <div class="composer">
          <Input
            class="font-mono text-xs"
            type="password"
            ref={enfocar}
            value={clave()}
            placeholder={t("settings.accounts.key_placeholder")}
            onInput={(e) => setClave(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardarClave()}
          />
          <Button
            disabled={guardandoClave() || !clave().trim()}
            onClick={() => void guardarClave()}
          >
            {guardandoClave()
              ? t("settings.accounts.saving")
              : t("settings.accounts.save")}
          </Button>
        </div>
      </div>
      </DialogContent>
      </Dialog>
    </Show>
  );
  return { DialogoDeClave, DialogoDeConfirmacion };
}
