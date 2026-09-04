import { cp, mkdir, readFile, rm } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "styles.css", "engine.js", "game.js"]) {
  const source = new URL(`../${file}`, import.meta.url);
  const contents = await readFile(source, "utf8");
  if (!contents.trim()) throw new Error(`${file} is empty`);
  await cp(source, new URL(file, output));
}

console.log("Static production build created in dist/");
