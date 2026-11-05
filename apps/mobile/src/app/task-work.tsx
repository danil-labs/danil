import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Platform } from "react-native";
import { w } from "../lib/i18n";
import type { WorkRun } from "../lib/steps";
import { shownRun, useWorkState } from "../lib/workSheet";
import { WorkSheet } from "../ui/chat/Work";
import { SheetTitle } from "../ui/components";
import { Sheet } from "../ui/Sheet";

const DETENTS = [0.5, 0.95] as const;

/**
 * Los detalles de una ejecución, sobre la tarea que sigue montada debajo. Sin esa
 * tarea (recarga en web, regreso del inicio de sesión) no hay qué enseñar y se vuelve
 * a ella; si la tarea sigue y la ejecución ya no está, queda lo último que se vio.
 */
export default function TaskWork() {
  const { host, workspace, folder, id, run: runKey, at, find } = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string; run: string; at?: string; find?: string }>();
  const state = useWorkState(`${host}/${id}`);
  const known = useRef<WorkRun | null>(null);
  // En web la hoja baja primero y la pantalla se quita al terminar.
  const [open, setOpen] = useState(true);
  const close = Platform.OS === "web" ? () => setOpen(false) : () => router.back();
  if (!state) return <Redirect href={{ pathname: "/task/[host]/[workspace]/[folder]/[id]", params: { host, workspace, folder, id } }} />;
  known.current = shownRun(known.current, state.runs.find((run) => run.key === runKey));
  const content = (
    <WorkSheet state={state} run={known.current} last={state.runs.at(-1)?.key === runKey} focus={Number(at ?? 0)} find={find ?? ""} onClose={close} />
  );
  if (Platform.OS === "web") {
    return (
      <Sheet visible={open} title={w("chat.work.title")} detents={DETENTS} onClose={close} onHidden={() => router.back()}>
        {content}
      </Sheet>
    );
  }
  return (
    <>
      <SheetTitle>{w("chat.work.title")}</SheetTitle>
      {content}
    </>
  );
}
