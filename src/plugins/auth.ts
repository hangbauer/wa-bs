import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    appId: string;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    apiKeys: Map<string, string>;
  }
}

const authPlugin: FastifyPluginAsync<{ apiKeys: Config["API_KEYS"] }> = async (
  app,
  { apiKeys }
) => {
  app.decorate("apiKeys", apiKeys);

  const publicPaths = new Set(["/healthz", "/webhook/whatsapp"]);

  app.addHook("onRequest", async (request, reply) => {
    if (publicPaths.has(request.url.split("?")[0] ?? request.url)) return;
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing_api_key" });
    }
    const key = auth.slice("Bearer ".length).trim();
    const appId = apiKeys.get(key);
    if (!appId) {
      return reply.code(401).send({ error: "invalid_api_key" });
    }
    request.appId = appId;
  });
};

export default fp(authPlugin, { name: "auth" });
