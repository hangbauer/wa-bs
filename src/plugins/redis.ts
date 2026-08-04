import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync<{ url: string }> = async (app, { url }) => {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

  redis.on("error", (err) => app.log.error({ err }, "redis error"));

  app.decorate("redis", redis);
  app.addHook("onClose", () => redis.quit());
};

export default fp(redisPlugin, { name: "redis" });
