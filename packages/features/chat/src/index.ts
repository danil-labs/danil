/**
 * Punto de entrada público de la feature @danil/feature-chat.
 * Exporta pantallas y piezas que el shell monta.
 */

// Pantallas
export { ChatScreen } from "./screens/ChatScreen.tsx";
export type { ChatScreenProps } from "./screens/ChatScreen.tsx";

// Componentes
export { MessageItem } from "./components/MessageItem.tsx";
export type { MessageItemProps } from "./components/MessageItem.tsx";
export { ReasoningBlock } from "./components/ReasoningBlock.tsx";
export type { ReasoningBlockProps } from "./components/ReasoningBlock.tsx";
export { ToolPermissionCard } from "./components/ToolPermissionCard.tsx";
export type { ToolPermissionCardProps } from "./components/ToolPermissionCard.tsx";
export { Composer } from "./components/Composer.tsx";
export type { ComposerProps } from "./components/Composer.tsx";
export { ErrorBanner } from "./components/ErrorBanner.tsx";
export type { ErrorBannerProps } from "./components/ErrorBanner.tsx";

// Store
export { createChatStore } from "./store.ts";
export type { ChatStoreState } from "./store.ts";

// Tipos de modelo
export type {
  ChatTurnView,
  ChatHistoryView,
  ChatStreamEvent,
  ChatRole,
  TurnPiece,
  ReasoningPiece,
  DeltaPiece,
  ToolPiece,
  ShellPiece,
  PermissionPiece,
  QuestionPiece,
  TurnStatus,
  TurnState,
} from "./model.ts";
