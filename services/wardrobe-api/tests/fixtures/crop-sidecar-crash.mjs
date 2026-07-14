#!/usr/bin/env node
import readline from "node:readline";
process.stdout.write(JSON.stringify({ type: "ready" }) + "\n");
readline.createInterface({ input: process.stdin }).once("line", () => process.exit(2));
