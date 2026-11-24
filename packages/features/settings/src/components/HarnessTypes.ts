import { type Frase } from "../../../../ui/src/lib/prose";
import { type Failure } from "../../../../ui/src/Failure";

export type RemoteWorkspace = { id: string; name: string };

type LoginView = {
  server: string;
  running: boolean;
  prompt: { uri: string; code: string } | null;
  failure: Failure | null;
};

export type Status = {
  cloud_server: string;
  server: string | null;
  signed_in: boolean;
  workspace: RemoteWorkspace | null;
  login: LoginView | null;
};

type Organization = { id: string; name: string };

export type Identity = {
  status: string;
  email: string | null;
  name: string | null;
  organization: string | null;
  organizations: Organization[];
  note: Frase | null;
};

export type Mode = "cloud" | "custom";
