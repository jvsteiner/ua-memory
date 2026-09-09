#!/usr/bin/env node
import { run } from "../dist/cli.js";

const { out, code } = run(process.argv.slice(2), process.cwd());
if (out) process.stdout.write(`${out}\n`);
process.exit(code);
