/** Rutas de otra máquina: `/home/<usuario>` se ve como `~` (danil-labs/terminus-workspace#11). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { abbreviateHomePath, remoteHost, remotePathLabel } from "../../src/lib/remote-path.ts";

test("abbreviates /home/<user> to ~", () => {
  assert.equal(abbreviateHomePath("/home/alberto/Documents/Danil"), "~/Documents/Danil");
  assert.equal(abbreviateHomePath("/home/so5a8ff067d29381776119bdf1d235/Documents/Danil"), "~/Documents/Danil");
  assert.equal(abbreviateHomePath("/home/alberto"), "~");
  assert.equal(abbreviateHomePath("/home/alberto/"), "~/");
});

test("leaves other paths alone", () => {
  for (const path of ["/home", "/home/", "/srv/danil/org/w/x", "/Users/alberto/Documents", "C:\\Users\\a", "~/x", "/opt/home/a/b", ""])
    assert.equal(abbreviateHomePath(path), path);
});

test("labels the path with its machine", () => {
  assert.equal(remotePathLabel("/home/alberto/Documents/Danil", "Nube IA"), "Nube IA · ~/Documents/Danil");
  assert.equal(remotePathLabel("/home/alberto/Documents/Danil", " "), "~/Documents/Danil");
  assert.equal(remotePathLabel("/home/alberto/Documents/Danil", null), "~/Documents/Danil");
});

test("the remote host is the one serving a workspace this computer does not have", () => {
  const nube = { id: "cmp_nube", local: false, hosts: true };
  assert.equal(remoteHost([{ id: "local", local: true, hosts: false }, nube]), "cmp_nube");
  assert.equal(remoteHost([nube]), "cmp_nube", "on the web there is no local machine");
  assert.equal(remoteHost([{ id: "local", local: true, hosts: true }, nube]), null, "here wins");
  assert.equal(remoteHost([{ id: "local", local: true, hosts: false }, { id: "cmp_off", local: false, hosts: null }]), null);
  assert.equal(remoteHost([]), null);
});
