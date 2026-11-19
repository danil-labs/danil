type Options = { headers?: HeadersInit } | undefined;

export function headerOf(options: Options, name: string): string | null {
  try {
    return new Headers(options?.headers).get(name) || null;
  } catch {
    return null;
  }
}

export function withoutHeader(options: Options, name: string): Options {
  if (!options?.headers) return options;
  const headers = new Headers(options.headers);
  headers.delete(name);
  return { ...options, headers: Object.fromEntries(headers.entries()) };
}

