import { createSignal } from "solid-js";

export function createAddWorkspaceMenuState() {
  const [open, setOpen] = createSignal(false);
  const [step, setStep] = createSignal<"menu" | "danil">("menu");
  const [context, setContext] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const close = () => { setOpen(false); setStep("menu"); setQuery(""); };
  return { open, setOpen, step, setStep, context, setContext, query, setQuery, close };
}
