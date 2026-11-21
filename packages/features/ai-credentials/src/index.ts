// Entrada pública de la feature ai-credentials
export { AiCredentialsScreen } from "./screens/AiCredentialsScreen.tsx";
export type { AiCredentialsScreenProps } from "./screens/AiCredentialsScreen.tsx";

export { ProviderCard } from "./components/ProviderCard.tsx";
export type { ProviderCardProps } from "./components/ProviderCard.tsx";

export { MachineWakeNotice } from "./components/MachineWakeNotice.tsx";
export type { MachineWakeNoticeProps, MissingMachineItem } from "./components/MachineWakeNotice.tsx";

export { CredentialErrorNotice } from "./components/CredentialErrorNotice.tsx";
export type { CredentialErrorNoticeProps } from "./components/CredentialErrorNotice.tsx";

export {
  useProviders,
  useMachineAccountCredentials,
  useWorkspaceAccounts,
  useConnectAccount,
  useDeleteAccount,
  useRemoveMachineAccount,
  useRestoreMachineAccount,
  useWakeMachine,
} from "./queries.ts";
export type {
  UseProvidersReturn,
  UseMachineAccountCredentialsReturn,
  ConnectAccountOptions,
  MachineQueryTarget,
} from "./queries.ts";

export type {
  SupportedProvider,
  RawAccountCredentialsListOutput,
  MachineCredentialState,
  MachineCredentialStatus,
  CredentialKind,
  WorkspaceCredential,
  WorkspaceRecipient,
  WorkspaceAccountsResponse,
  SealedCopy,
  PutWorkspaceAccountPayload,
  ProviderViewItem,
} from "./model.ts";

export {
  sealCredential,
  sealForRecipients,
  canSeal,
  fromBase64,
  toBase64,
  SEAL_MAX_BYTES,
} from "./seal.ts";
export type { SealOptions, SealRecipient } from "./seal.ts";
