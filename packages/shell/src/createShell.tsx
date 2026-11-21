import type { Component, JSX } from "solid-js";
import type { SessionSource } from "@danil/session";
import type { PlatformClient } from "@danil/platform-client";
import type { Host } from "@danil/host";
import { App, type AppProps } from "./App.tsx";

export interface CreateShellOptions {
  session?: SessionSource;
  platform?: PlatformClient;
  host?: Host;
  initialPath?: string;
}

export interface ShellInstance {
  (props?: Partial<AppProps>): JSX.Element;
  App: Component<AppProps>;
  options: CreateShellOptions;
}

/**
 * Crea una instancia de Shell configurada con dependencias inyectadas:
 * sesión, cliente de plataforma y host.
 */
export function createShell(options: CreateShellOptions = {}): ShellInstance {
  const ShellComponent = (props: Partial<AppProps> = {}) => (
    <App
      sessionSource={props.sessionSource ?? options.session}
      platform={props.platform ?? options.platform}
      host={props.host ?? options.host}
      initialPath={props.initialPath ?? options.initialPath}
      isDesk={props.isDesk}
    />
  );

  return Object.assign(ShellComponent, {
    App,
    options,
  });
}
