import { invoke } from "../../../../engine-client/src/client.ts";
import type { MemoriaListado, MemoriaScope } from "../../../../ui/src/lib/model";

export const writeMemoryEntry = (payload: {
  project: string;
  scope: MemoriaScope;
  file: string;
  text: string;
  type?: string | null;
  expected_oid?: string | null;
}): Promise<void> =>
  invoke("write_memory_entry", payload);

export const listMemoryEntries = (payload: {
  project: string;
  scope: MemoriaScope;
}): Promise<(MemoriaListado)> =>
  invoke<(MemoriaListado)>("list_memory_entries", payload);

export const deleteMemoryEntry = (payload: {
  project: string;
  scope: MemoriaScope;
  file: string;
}): Promise<void> =>
  invoke("delete_memory_entry", payload);
