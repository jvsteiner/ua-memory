#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let run;
try {
  ({ run } = await import(join(here, "..", "dist", "cli.js")));
} catch {
  process.stderr.write(
    "ua-memory is not built. Run `npm install && npm run build` in the plugin directory.\n",
  );
  process.exit(1);
}

const { out, code } = run(process.argv.slice(2), process.cwd());
if (out) process.stdout.write(`${out}\n`);
process.exit(code);
