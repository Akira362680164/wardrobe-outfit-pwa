import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const FaultSchema = z.object({
  method: z.string().min(1).default("GET"),
  pathIncludes: z.string().min(1),
  times: z.number().int().min(1).max(100).default(1),
  statusCode: z.number().int().min(400).max(599).default(503),
  code: z.string().min(1).default("server"),
  message: z.string().min(1).default("E2E injected server fault"),
});

type Fault = z.infer<typeof FaultSchema>;

export function registerTestFaultInjection(app: FastifyInstance): void {
  const faults: Fault[] = [];

  app.post("/api/test/faults", async (request, reply) => {
    if (!isEnabled()) return reply.code(404).send({ code: "not_found", message: "Not found", retryable: false });
    if (!isAuthorized(request)) return reply.code(403).send({ code: "auth", message: "Forbidden", retryable: false });

    const fault = FaultSchema.parse(request.body);
    const normalized: Fault = { ...fault, method: fault.method.toUpperCase() };
    faults.push(normalized);
    return { status: "armed", fault: normalized };
  });

  app.delete("/api/test/faults", async (request, reply) => {
    if (!isEnabled()) return reply.code(404).send({ code: "not_found", message: "Not found", retryable: false });
    if (!isAuthorized(request)) return reply.code(403).send({ code: "auth", message: "Forbidden", retryable: false });

    faults.splice(0, faults.length);
    return { status: "cleared" };
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!isEnabled() || request.url.startsWith("/api/test/faults")) return;

    const index = faults.findIndex((fault) =>
      request.method.toUpperCase() === fault.method.toUpperCase()
      && request.url.includes(fault.pathIncludes),
    );
    if (index < 0) return;

    const fault = faults[index]!;
    fault.times -= 1;
    if (fault.times <= 0) faults.splice(index, 1);

    return sendFault(reply, fault);
  });
}

function isEnabled(): boolean {
  return Boolean(process.env.E2E_FAULT_TOKEN)
    && (
      process.env.WARDROBE_ENV === "test"
      || process.env.NODE_ENV === "test"
      || process.env.WARDROBE_E2E_FAULTS === "1"
    );
}

function isAuthorized(request: FastifyRequest): boolean {
  const token = process.env.E2E_FAULT_TOKEN;
  if (!token) return false;
  const headerToken = String(request.headers["x-e2e-fault-token"] ?? "");
  const bearer = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  return headerToken === token || bearer === token;
}

function sendFault(reply: FastifyReply, fault: Fault) {
  return reply.code(fault.statusCode).send({
    code: fault.code,
    message: fault.message,
    retryable: true,
  });
}
