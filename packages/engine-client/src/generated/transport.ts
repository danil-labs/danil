// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface EngineTransport {
  call(name: string, params: unknown): Promise<unknown>;
  subscribe(event: string, cb: (payload: unknown) => void): () => void;
}
