import assert from "node:assert/strict";
import test from "node:test";
import { webWorkspacePicker } from "../../src/web/workspace-picker.ts";

function fixture() {
  let activeOrg = "org_A"; let selected: string | null = null; let reloads = 0;
  const store = new Map<string,string>(); const writes: string[] = [];
  const organizations = [{id:"org_A", name:"A"}, {id:"org_B", name:"B"}];
  const row = { id:"42", name:"Archivo", org:"org_B", role:"member", engine_workspace_id:"abcdef12" };
  const data = (body: unknown) => Promise.resolve(Response.json(body));
  const transport = {
    call(path: string) {
      if (path === "identity/organizations") return data({items:organizations,active_organization_id:activeOrg});
      if (path === "workspaces") return data({items:[row],next_cursor:null});
      throw new Error(path);
    },
    mutation(path: string, init?: RequestInit) {
      writes.push(path);
      if (path === "identity/organizations/select") {
        activeOrg = JSON.parse(String(init?.body)).organization_id;
        return data({organization:organizations.find(o=>o.id===activeOrg)});
      }
      return Promise.resolve(new Response(null,{status:204}));
    }
  };
  const create = (sub:string) => webWorkspacePicker(transport, {
    sub, reload:()=>{reloads++;}, accountLoginUrl:"https://edge.example.test/v1/identity/login?prompt=select_account", select:async id=>{selected=id;}, active:()=>selected,
    store:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)} as Storage,
  });
  return {create,writes,reloads:()=>reloads,selected:()=>selected};
}

test("only server organizations can be chosen, switching resumes once for the same person", async () => {
  const f=fixture();const picker=f.create("user_A");
  await assert.rejects(picker.catalog("org_outside"),/organization_not_available/);
  assert.deepEqual(f.writes,[]);
  assert.deepEqual(await picker.catalog("org_A"),[]);
  await assert.rejects(picker.catalog("org_B"),/organization_changed/);
  assert.equal(f.reloads(),1);assert.equal(picker.resume(),"org_B");assert.equal(picker.resume(),null);
  assert.deepEqual((await picker.catalog("org_B")).map(w=>[w.name,w.id]),[["Archivo","42"]]);
  await assert.rejects(picker.add("org_A","42"),/organization_changed/);
  await assert.rejects(picker.add("org_B","999"),/workspace_not_available/);
  await picker.add("org_B","42");
  assert.equal(f.selected(),"42");
  assert.deepEqual(f.writes,["identity/organizations/select","workspaces/preferences/added/abcdef12"]);
  assert.equal(f.reloads(),2);
});

test("a pending organization from another person never reopens their catalog", async () => {
  const f=fixture();await assert.rejects(f.create("user_A").catalog("org_B"));
  assert.equal(f.create("user_B").resume(),null);
});

test("a fresh picker restores only authorized, pinned engine ids in the active organization", async () => {
  const writes: { method?: string; path: string }[] = [];
  const preferences = new Set<string>();
  let fail = true;
  let reloads = 0;
  let active: string | null = null;
  const row = { id: "42", engine_workspace_id: "abcdef12", org: "org_B", role: "member", name: "QA" };
  const rows = [row, { ...row, org: "org_A", id: "9" }, { ...row, engine_workspace_id: "unlisted", id: "43" }];
  const make = () => webWorkspacePicker({
    call: async path => Response.json(path === "identity/organizations"
      ? { items: [{ id: "org_B", name: "B" }], active_organization_id: "org_B" }
      : path === "workspaces/preferences" ? { added: [...preferences], version: 2 } : { items: rows, next_cursor: null }),
    mutation: async (path, init) => {
      writes.push({ method: init?.method, path });
      if (fail) return new Response(null, { status: 503 });
      preferences.add(path.split("/").at(-1)!);
      return new Response(null, { status: 204 });
    },
  }, { sub: "user_A", store: {} as Storage, select: async id => { active = id; }, active: () => active,
    reload: () => { reloads++; }, accountLoginUrl: "https://edge.example.test/v1/identity/login?prompt=select_account" });
  await assert.rejects(make().add("org_B", "42"), /workspace_preference_not_saved/);
  assert.equal(reloads, 0);
  assert.deepEqual(await make().pinned("org_B", rows), []);
  fail = false;
  await make().add("org_B", "42");
  assert.equal(active, "42");
  assert.equal(reloads, 1);
  assert.deepEqual(writes, Array(2).fill({ method: "PUT", path: "workspaces/preferences/added/abcdef12" }));
  assert.deepEqual(await make().pinned("org_B", rows), [row]);
});
