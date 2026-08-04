import Fastify from "fastify";
import type { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import { OtpService } from "./services/otp.service.js";
import { WhatsAppService } from "./services/whatsapp.service.js";
import healthRoutes from "./routes/health.js";
import otpRoutes from "./routes/otp.js";
import webhookRoutes from "./routes/webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    otpService: OtpService;
    whatsapp: WhatsAppService;
    config: ReturnType<typeof loadConfig>;
  }
}

export interface BuildServerOptions {
  env?: NodeJS.ProcessEnv;
  redis?: Redis;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const { env = process.env, redis } = options;
  const config = loadConfig(env);

  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: "info" },
  });

  app.decorate("config", config);

  if (redis) {
    app.decorate("redis", redis);
    app.addHook("onClose", () => redis.quit());
  } else {
    await app.register(redisPlugin, { url: config.REDIS_URL });
  }

  await app.register(authPlugin, { apiKeys: config.API_KEYS });

  const otpService = new OtpService(app.redis, config);
  const whatsapp = new WhatsAppService(config);
  app.decorate("otpService", otpService);
  app.decorate("whatsapp", whatsapp);

  await app.register(healthRoutes);
  await app.register(otpRoutes);
  await app.register(webhookRoutes);

  return app;
}
