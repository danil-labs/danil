import { scan } from "./lib.mjs";

const ALLOWED = /^packages\/(platform-client|engine-client|session|host)\//;
const NET = /\bfetch\s*\(|new\s+WebSocket\b|\bEventSource\b|@tauri-apps\/api|\binvoke\s*[<(]/;

export function r1(files) {
  return scan(files, (f) => !ALLOWED.test(f.path), NET,
    "R1: red o invoke de Tauri fuera de platform-client, engine-client, session y host");
}
