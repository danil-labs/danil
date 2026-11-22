export type Preview = {
  rel: string;
  kind: "html" | "image" | "text" | "pdf" | "binary" | string;
  text: string | null;
  data_url: string | null;
  pdf: string | null;
  bytes: number;
  truncated: boolean;
};
