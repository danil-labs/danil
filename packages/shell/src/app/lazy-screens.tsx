// Pantallas en lazy del shell: movidas tal cual del nivel de módulo de App.tsx (tarea 2.5).
import { lazy } from "solid-js";
import { capabilities } from "../../../host/src/platform";
import { retryableLazy } from "../../../ui/src/LazyPart";

export const VisorDeArchivo = lazy(() => import("../../../features/code/src/screens/FileViewer"));
export const DeleteTaskDialog = lazy(() => import("../../../features/projects/src/screens/DeleteTaskDialog"));
export const HandoverDialog = lazy(() => import("../../../features/chat/src/screens/HandoverDialog"));
export const TaskFilesCard = lazy(() => import("../../../features/code/src/screens/TaskFiles"));
// Chunk aparte: el perfil completo de un agente solo se carga al abrirlo.
export const AgentProfile = retryableLazy(() => import("../../../features/projects/src/screens/AgentProfile"));
// El alta solo se abre sin workspace o al agregar otro: no entra en la carga inicial.
export const Onboarding = lazy(() => import("../../../features/onboarding/src/screens/Onboarding")), FuncionesAfectadas = lazy(() => import("../../../features/onboarding/src").then((m) => ({ default: m.FuncionesAfectadas }))), Integraciones = lazy(() => import("../../../features/onboarding/src/components/ToolCards").then((m) => ({ default: m.Integraciones })));
export const TaskLocation = lazy(() => import("../../../features/chat/src/screens/TaskLocation"));
export const Screen = lazy(() => import("../../../features/screen/src/screens/Screen"));
// El aviso de licencia solo se baja si la flota lo pide (trae los textos de Danil).
export const MachinesLicense = lazy(() =>
  import("../../../features/settings/src/screens/TerminusLicense").then((m) => ({
    default: (props: { onRetry: () => void }) => (
      // En el escritorio, el correo del sistema; en la web, el del navegador.
      <m.TerminusLicense compact onRequest={capabilities().nativeWindow ? m.requestAccessInBrowser : m.requestAccessInPage} onRetry={props.onRetry} />
    ),
  })),
);
// Chunk aparte: solo lo carga quien crea una tarea, no la carga inicial.
export const MachinePicker = lazy(() =>
  import("../../../features/machines/src/screens/MachinePicker").then((m) => ({ default: m.MachinePicker })),
);
// Llevar el trabajo a otra máquina: solo al enviar a una que no es la de la carpeta.
export const CarrySheet = lazy(() => import("../../../features/machines/src/screens/CarrySheet"));
export const CarryProgress = lazy(() => import("../../../features/machines/src/screens/CarryProgress"));
export const CarryOriginLabel = lazy(() =>
  import("../../../features/machines/src/screens/CarryProgress").then((m) => ({ default: m.CarryOriginLabel })),
);
export const VistaDeProyecto = lazy(() => import("../../../features/projects/src/screens/ProjectView"));
// Configuración solo se abre a pedido: no entra en la carga inicial.
export const Settings = lazy(() => import("./settingsSlots"));
export const DeleteSpace = lazy(() => import("../shell/DeleteSpace"));
