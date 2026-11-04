import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Lo que llegó de la máquina se guarda o se manda con la hoja de compartir del sistema. */
export const CAN_SAVE = true;

/**
 * Escribe los bytes en la caché con su nombre y abre la hoja del sistema
 * («Guardar en Archivos» en iOS; Drive, Descargas u otra app en Android).
 */
export async function saveFile(name: string, bytes: Uint8Array, mime: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("sharing_unavailable");
  // La copia anterior se borra ahora y no al cerrar la hoja: en Android la otra app puede seguir leyéndola.
  const root = new Directory(Paths.cache, "shared");
  try {
    if (root.exists) root.delete();
  } catch {
    // La caché la limpia el sistema.
  }
  // Una carpeta por archivo: el nombre queda tal cual.
  const folder = new Directory(root, `${Date.now()}`);
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, name.replace(/[/\\]/g, "_") || "file");
  file.create({ overwrite: true });
  await file.write(bytes);
  // En iOS `mimeType` añade una extensión al nombre; el nombre ya la trae.
  await Sharing.shareAsync(file.uri, Platform.OS === "android" ? { mimeType: mime, dialogTitle: name } : undefined);
}
