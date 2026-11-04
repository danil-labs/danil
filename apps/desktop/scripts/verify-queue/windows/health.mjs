#!/usr/bin/env node
/** `/health` de la cola por su pipe, para install.ps1 y para quien administra la VM: imprime el JSON, exit 1 si no responde. */
import { get } from "node:http";

const pipe = process.argv[2] ?? "\\\\.\\pipe\\verify-queue";
get({ socketPath: pipe, path: process.argv[3] ?? "/health", timeout: 5_000 }, (response) => {
  let body = "";
  response.on("data", (chunk) => (body += chunk));
  response.on("end", () => {
    console.log(body);
    process.exit(response.statusCode === 200 ? 0 : 1);
  });
})
  .on("error", () => process.exit(1))
  .on("timeout", () => process.exit(1));
