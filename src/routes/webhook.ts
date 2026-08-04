import type { FastifyPluginAsync } from "fastify";

const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.get("/webhook/whatsapp", async (request, reply) => {
    const { query } = request as { query: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string } };
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === app.config.WA_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.type("text/plain").send(query["hub.challenge"] ?? "");
    }
    return reply.code(403).send("verification failed");
  });

  app.post("/webhook/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const entry = (body as { entry?: unknown[] })?.entry?.[0];
    const changes = entry
      ? ((entry as { changes?: unknown[] }).changes ?? [])
      : [];
    for (const change of changes) {
      const value = (change as { value?: unknown }).value as
        | { statuses?: unknown[]; messages?: unknown[] }
        | undefined;
      if (value?.statuses) {
        for (const status of value.statuses) {
          app.log.info({ status }, "whatsapp message status");
        }
      }
    }
    return reply.code(200).send("OK");
  });
};

export default webhookRoutes;
