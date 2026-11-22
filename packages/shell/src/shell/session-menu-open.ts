import type { sessionRail } from "./session-groups";

export function openRequestedSessionMenu(rail: ReturnType<typeof sessionRail>, update: {
  context: (id: string | null) => void;
  step: (step: "menu" | "danil") => void;
  open: (open: boolean) => void;
}) {
  const context = rail.laterContext();
  const notice = rail.menuNotice();
  if (!context && !notice) return;
  update.context(context);
  update.step(context ? "danil" : "menu");
  update.open(true);
  if (context) rail.acknowledgeLater();
  if (notice) rail.acknowledgeNotice();
}
