import {
  createResource,
  type Accessor,
  type Resource,
} from "solid-js";
import {
  createPlatformClient,
  type PlatformClient,
} from "@danil/platform-client";
import type { ProfileData } from "./model.ts";
import { getPlanLabel } from "./model.ts";

export interface UseProfileOptions {
  client?: PlatformClient | (() => PlatformClient | undefined | null);
  sessionKey?: Accessor<string | undefined | null> | string | null;
}

export interface UseProfileResult {
  profile: Resource<ProfileData | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
  refetch: (info?: unknown) => void;
}

/**
 * Consulta el perfil del usuario, plan y organización actual.
 * Preserva el error en error() para permitir reintentos (B-006).
 */
export function useProfile(options?: UseProfileOptions): UseProfileResult {
  const resolveClient = (): PlatformClient => {
    const provided = typeof options?.client === "function" ? options.client() : options?.client;
    return provided ?? createPlatformClient();
  };

  const currentSessionKey = () => {
    const key = typeof options?.sessionKey === "function" ? options.sessionKey() : options?.sessionKey;
    return key ?? "current";
  };

  const [data, { refetch }] = createResource(
    currentSessionKey,
    async () => {
      const client = resolveClient();
      const me = await client.getMe();

      let orgs = me.organizations ?? [];
      let activeOrgId = me.active_organization_id;

      if (orgs.length === 0) {
        try {
          const orgRes = await client.getOrganizations();
          orgs = orgRes.items ?? orgRes.organizations ?? [];
          if (!activeOrgId) {
            activeOrgId = orgRes.active_organization_id;
          }
        } catch {
          // Si no responde organizaciones, continuamos con el perfil base
        }
      }

      const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;
      const planLabel = getPlanLabel(activeOrg);

      return {
        me,
        activeOrganization: activeOrg,
        planLabel,
      };
    }
  );

  return {
    profile: data,
    loading: () => data.loading,
    error: () => data.error,
    refetch: (info?: unknown) => {
      void refetch(info);
    },
  };
}
