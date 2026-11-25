/**
 * Qué hay instalado, según Rust. Espeja `src-tauri/src/environment/env.rs`; el tipo lo
 * consumen `Setup.tsx` y `Environment.tsx`.
 */

export {
  type Requirement,
  ORIGEN_SISTEMA,
  ORIGEN_APP,
  ORIGEN_BUNDLE,
  type Dependency,
  type EnvReport,
} from "../../../../ui/src/lib/bundled";
