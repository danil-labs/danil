import type {
  Me as PlatformMe,
  OrganizationRef as PlatformOrganizationRef,
} from "@danil/platform-client";

export type Profile = PlatformMe;
export type Organization = PlatformOrganizationRef;

export interface ProfileData {
  me: Profile;
  activeOrganization: Organization | null;
  planLabel: string;
}
