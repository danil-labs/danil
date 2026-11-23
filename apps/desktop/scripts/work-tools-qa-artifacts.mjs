import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const [directory, output, target] = process.argv.slice(2);
if (!directory || !output || !["linux", "macos", "windows"].includes(target)) {
  throw new Error("Expected release-assets, output and platform");
}
const suffix = { linux: "_amd64.AppImage", macos: "_aarch64.dmg", windows: "_x64-setup.exe" }[target];
const names = (await readdir(directory)).filter((name) => name.endsWith(suffix));
if (names.length !== 1) throw new Error("Expected one canonical installer");
const name = names[0], source = path.resolve(directory, name);
const bytes = (await stat(source)).size, chunkSize = 80 * 1024 * 1024;
const count = Math.ceil(bytes / chunkSize);
if (!count || count > 8) throw new Error("QA installer exceeds eight bounded artifacts");
const digest = async (file) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
};
await mkdir(output, { recursive: true });
const manifest = { schema: 1, platform: target, file: name, bytes, sha256: await digest(source), chunks: [] };
const input = await open(source, "r");
try {
  for (let index = 0; index < count; index++) {
    const artifact = `qa-${target}-installer-${index + 1}`;
    const file = `${name}.part-${String(index + 1).padStart(2, "0")}`;
    const length = Math.min(chunkSize, bytes - index * chunkSize);
    const chunk = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const result = await input.read(chunk, offset, length - offset, index * chunkSize + offset);
      if (!result.bytesRead) throw new Error("Installer changed while preparing QA artifacts");
      offset += result.bytesRead;
    }
    await writeFile(path.join(output, file), chunk);
    manifest.chunks.push({ artifact, file, bytes: length, sha256: createHash("sha256").update(chunk).digest("hex") });
  }
} finally {
  await input.close();
}
if (await digest(source) !== manifest.sha256) throw new Error("Installer changed while preparing QA artifacts");
const metadata = `qa-${target}-installer.json`;
await writeFile(path.join(output, metadata), JSON.stringify(manifest, null, 2) + "\n");
console.log(await readFile(path.join(output, metadata), "utf8"));
