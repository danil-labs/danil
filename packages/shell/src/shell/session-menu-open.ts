import type { sessionRail } from "./session-groups";

export function openRequestedSessionMenu(rail: ReturnType<typeof sessionRail>, update: {
  context: (id: string | null) => void;
  step: (step: "menu" | "danil") => void;
  open: (open: boolean) => void;
}) {
  const context = rail.laterContext();
  if (context) {
    update.context(context);
    update.step("danil");
    update.open(true);
    rail.acknowledgeLater();
  }
  if (rail.menuNotice()) rail.acknowledgeNotice();
}
