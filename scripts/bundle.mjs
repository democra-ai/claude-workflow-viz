// Bundle the CLI into a single dependency-free ESM file that the Claude Code
// plugin (and anyone) can run with `node bin/wfviz.mjs` — no build, no install.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "bin/wfviz.mjs",
  legalComments: "none",
});

// esbuild can emit the entry's shebang (sometimes more than once); normalize to
// exactly one valid shebang on line 1.
const file = "bin/wfviz.mjs";
let s = readFileSync(file, "utf8").replace(/^(#!.*\r?\n)+/, "");
writeFileSync(file, "#!/usr/bin/env node\n" + s);
console.log(`bundled ${file} (${(s.length / 1024).toFixed(0)} kb)`);
