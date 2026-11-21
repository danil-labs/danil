import { App, type AppProps } from "./App.tsx";
import type { JSX } from "solid-js";

export function Shell(props: AppProps): JSX.Element {
  return <App {...props} />;
}
