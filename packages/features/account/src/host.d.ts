declare module "@danil/host" {
  export interface Host {
    openExternal(url: string): Promise<void> | void;
  }
  export const host: Host;
}
