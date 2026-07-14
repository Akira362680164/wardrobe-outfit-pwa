#!/usr/bin/env node
import readline from "node:readline";
process.stdout.write(JSON.stringify({ type: "ready", pid: process.pid }) + "\n");
let count = 0;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line); count += 1;
  process.stdout.write(JSON.stringify({ type: "result", requestId: request.requestId, cropBox: { x: .25, y: .25, width: .5, height: .5 }, confidence: .9, needsReview: false, reasonCodes: [], modelVersion: `fixture-${process.pid}-${count}` }) + "\n");
});
