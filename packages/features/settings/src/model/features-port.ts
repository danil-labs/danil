import type { Component } from "solid-js";
import type { AgentProfile, HandlerStatus } from "../../../../ui/src/lib/model";
import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";
import type { ModelChoices } from "../../../../ui/src/lib/model-choices";

/**
 * Lo que Configuración pinta de projects (la cara, el alta y los perfiles de
 * los agentes) y de chat (el saldo de Danil Credits). Lo enchufa el shell (R3):
 * las pantallas lo leen con los mismos nombres que exportan esas features.
 */
export type PiezasDeAjustes = {
  AstroAvatar: Component<{ name: string; status: HandlerStatus; size?: number; class?: string; body?: string | null; avatar?: string | null }>;
  NewAgent: Component<{
    abierto: boolean;
    onAbrir: (abierto: boolean) => void;
    project: string;
    workspaceOnly?: boolean;
    modelos: ModelChoices;
    createFreeRouterConsent: CreateFreeRouterConsent;
    onCreado: () => void;
    carpetas?: { id: string; name: string }[];
    onCloseAutoFocus?: (e: Event) => void;
  }>;
  displayName: (name: string, profile?: AgentProfile) => string;
  notifyProfiles: () => void;
  createDanilCreditsBalance: () => { label: () => string };
};
