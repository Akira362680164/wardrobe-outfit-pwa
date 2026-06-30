import type { FastifyReply } from "fastify";
import { z } from "zod";

import { AuthApiError } from "../auth/registrations.js";

export class WorkspaceApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: "auth" | "conflict" | "server" | "not_found" | "image_upload" | "invalid_request" | "mutation_in_progress",
    message: string,
    readonly retryable = false,
    readonly serverData?: unknown,
  ) {
    super(message);
  }
}

export function sendWorkspaceError(reply: FastifyReply, error: unknown) {
  const requestId = reply.getHeader("x-wardrobe-request-id");
  if (error instanceof WorkspaceApiError) {
    return reply.code(error.statusCode).send({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(requestId ? { requestId: String(requestId) } : {}),
      ...(error.serverData === undefined ? {} : { serverData: error.serverData }),
    });
  }
  if (error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({ code: "auth", message: error.message, retryable: false, ...(requestId ? { requestId: String(requestId) } : {}) });
  }
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "invalid_request", message: "Workspace 请求格式不正确", retryable: false, ...(requestId ? { requestId: String(requestId) } : {}) });
  }
  throw error;
}
