/**
 * Lo que se pega en un orquestador de esta máquina para que arranque
 * `terminus mcp serve` con su credencial (`local_orchestrator_connect`).
 */
export function snippets(o: { credential_file: string; cli: string | null; credential_env?: string }): { id: string; text: string }[] {
  // Un motor anterior no dice `credential_env` y solo lee TERMINUS_CREDENTIAL. El valor acaba en
  // un comando que se pega en la terminal: otro nombre no se muestra.
  const env = o.credential_env ?? "TERMINUS_CREDENTIAL";
  if (env !== "DANIL_CREDENTIAL" && env !== "TERMINUS_CREDENTIAL") return [];
  const cli = o.cli ?? "terminus";
  const quoted = (v: string) => (/^[\w./:@-]+$/.test(v) ? v : JSON.stringify(v));
  return [
    { id: "claude", text: `claude mcp add danil -e ${env}=${quoted(o.credential_file)} -- ${quoted(cli)} mcp serve` },
    {
      id: "hermes",
      text: ["mcp_servers:", "  danil:", `    command: ${JSON.stringify(cli)}`, "    args: [mcp, serve]", "    env:", `      ${env}: ${JSON.stringify(o.credential_file)}`].join("\n"),
    },
    {
      id: "generic",
      text: JSON.stringify({ mcpServers: { danil: { command: cli, args: ["mcp", "serve"], env: { [env]: o.credential_file } } } }, null, 2),
    },
  ];
}

