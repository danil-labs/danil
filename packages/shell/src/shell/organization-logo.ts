import { invoke } from "../../../engine-client/src/client.ts";
import { imagenInerte } from "../../../../apps/desktop/src/lib/links";
import { capabilities } from "../../../host/src/platform";

const images = new Map<string, Promise<string | null>>();
if (typeof window !== "undefined") window.addEventListener("harness:workspace-name", () => images.clear());
export function organizationLogo(context: string, workspace: string, path: string | null): Promise<string | null> {
  if (!capabilities().nativeWindow) return Promise.resolve(null);
  if (!path) return Promise.resolve(null);
  const key = JSON.stringify([context, workspace, path]);
  let image = images.get(key);
  if (!image) {
    image = invoke<{ data_url: string | null }>("preview_file", { workspace, path, rel: path }, { headers: { "x-danil-context": context } }).then((reply) => imagenInerte(reply.data_url)).catch(() => { images.delete(key); return null; });
    images.set(key, image);
  }
  return image;
}
