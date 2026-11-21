import type { JSX } from "solid-js";

function IconBase(props: {
  size?: number;
  class?: string;
  children: JSX.Element;
  fill?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill={props.fill ?? "none"}
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 2}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}


export function Square(props: { size?: number; class?: string; fill?: string }) {
  return (
    <IconBase size={props.size} class={props.class} fill={props.fill}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </IconBase>
  );
}

export function SquareCheck(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function Minimize2(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" x2="21" y1="10" y2="3" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </IconBase>
  );
}

export function ChevronLeft(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ChevronRight(props: {
  size?: number;
  class?: string;
  strokeWidth?: number;
  "aria-hidden"?: string;
}) {
  return (
    <IconBase size={props.size} class={props.class} strokeWidth={props.strokeWidth}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}


export function Pencil(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </IconBase>
  );
}

export function CornerDownRight(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </IconBase>
  );
}

export function ArrowUp(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </IconBase>
  );
}


export function SquareTerminal(props: { size?: number; class?: string }) {
  return (
    <IconBase size={props.size} class={props.class}>
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </IconBase>
  );
}
