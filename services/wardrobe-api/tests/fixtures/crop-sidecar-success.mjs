#!/usr/bin/env node
process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(JSON.stringify({ cropBox: { x: .25, y: .25, width: .5, height: .5 }, confidence: .9, needsReview: false, reasonCodes: [], modelVersion: "fixture" })));
