import {
  planLabel,
  type OrganizationRef as PlatformOrganizationRef,
  type Workspace as PlatformWorkspace,
} from "@danil/platform-client";

export { planLabel };
export const getPlanLabel = planLabel;

export type Workspace = PlatformWorkspace & {
  logo?: string | null;
};

export type Organization = PlatformOrganizationRef & {
  planLabel: string;
};

export interface WorkspaceGroup {
  organization: Organization;
  workspaces: Workspace[];
}
