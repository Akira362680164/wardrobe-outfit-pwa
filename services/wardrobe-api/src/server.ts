import { buildApp } from "./app.js";
import { closeDatabase } from "./db/client.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const app = buildApp();

async function shutdown() {
  await app.close();
  await closeDatabase();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ host, port });
