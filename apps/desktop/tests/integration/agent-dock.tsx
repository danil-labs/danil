import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import AgentDock from "../../../../packages/shell/src/shell/AgentDock";
import "../../../../packages/ui/src/styles/global.css";
const [folder, setFolder] = createSignal("one");
const [working, setWorking] = createSignal(false);
let clicks = 0;
Object.assign(window, { qa: { switchFolder: () => setFolder(folder() === "one" ? "two" : "one"), activate: () => setWorking(true), clicks: () => clicks } });
render(() => <div style={{width:"250px", margin:"50px"}}><AgentDock agents={Array.from({length:13}, (_,i)=>({name:`agent-${i}`, liveTasks:0, status: working() && i === 12 ? "working" : "asleep"}))} currentFolder={folder()} selected={null} foldersOf={() => [{id:"one",name:"one"},{id:"two",name:"two"}]} onTalk={() => {clicks++}} onProfile={() => {}} onShowTasks={() => {}} onSeeAll={() => {}} /></div>, document.getElementById("root")!);
