import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/healthz", async (_request, reply) => {
    try {
      await app.redis.ping();
      return reply.send({ status: "ok" });
    } catch {
      return reply.code(503).send({ status: "error", message: "redis unreachable" });
    }
  });
};

export default healthRoutes;
