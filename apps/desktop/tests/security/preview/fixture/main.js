import { message } from "/message.js";
const ok = (id, text) => { const element = document.getElementById(id); element.dataset.state = "ok"; if (text) element.textContent = text; };
if (getComputedStyle(document.getElementById("css")).getPropertyValue("--fixture-css").trim() === "loaded") ok("css");
ok("js");
const ping = await fetch("/api/ping").then(response => response.json());
if (ping.ok) ok("fetch");
document.getElementById("hmr").textContent = message;
if (import.meta.hot) {
  import.meta.hot.on("echo", value => { if (value === "echo-through-relay") ok("ws"); });
  import.meta.hot.send("echo", "echo-through-relay");
  import.meta.hot.accept("/message.js", updated => ok("hmr", updated.message));
}
