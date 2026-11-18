export type SiteProps = {
  url: string;
  visible: boolean;
  context?: { workspace: string | null; session: string; machine?: string };
  navegador?: boolean;
  onNavego?: (url: string) => void;
};
