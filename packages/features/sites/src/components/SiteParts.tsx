import { Show } from "solid-js";
import { Button } from "../../../../ui/src/Button";
import { corta } from "../../../../ui/src/lib/sites";
import { t } from "../../../../ui/src/lib/i18n";

/** `inicio` es la pestaña de navegador recién abierta: no hay capa hasta que se teclea a dónde ir. */
export type Estado = "inicio" | "abriendo" | "cargando" | "listo" | "fallo";

/** Atrás, adelante y recargar: la barra de `Site.tsx`. */
export function NavegacionDeSitio(props: { ir: (delta: number) => void; reintentar: () => void }) {
  const { ir, reintentar } = props;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("sites.back")}
        title={t("sites.back")}
        onClick={() => ir(-1)}
      >
        ←
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("sites.forward")}
        title={t("sites.forward")}
        onClick={() => ir(1)}
      >
        →
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("sites.reload")}
        title={t("sites.reload")}
        onClick={reintentar}
      >
        ⟳
      </Button>
    </>
  );
}

/** Lo que se ve sobre el hueco mientras la capa no está: abriendo, la pestaña vacía o el fallo. */
export function EstadosDeSitio(props: { estado: () => Estado; destino: () => string; fallo: () => string; reintentar: () => void }) {
  const { estado, destino, fallo, reintentar } = props;
  return (
    <>
      <Show when={estado() === "abriendo"}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span class="text-ui text-neutral-500">
            {t("sites.opening", { site: corta(destino()) })}
          </span>
        </div>
      </Show>

      <Show when={estado() === "inicio"}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span class="text-ui text-neutral-500">{t("sites.start")}</span>
        </div>
      </Show>

      <Show when={estado() === "fallo"}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <span class="max-w-[46ch] text-ui text-neutral-700">{fallo()}</span>
          <Button variant="secondary" size="sm" onClick={reintentar}>
            {t("sites.retry")}
          </Button>
        </div>
      </Show>
    </>
  );
}
