import { capabilities } from "../../lib/platform";
import type { OrganizationOpenDeps } from "./web-organization-open";

/** Lo que la página web ofrece para cambiar de organización y abrir un workspace en ella. */
export function webOrganizationDeps(): OrganizationOpenDeps {
  const c = capabilities();
  return { me: c.webAccounts?.current.user_id, picker: c.webWorkspacePicker, organizations: c.organizations, reauth: c.webReauth?.signIn };
}
