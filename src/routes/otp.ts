import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, "phone must be in E.164 format, e.g. +6281234567890");

const requestOtpSchema = z.object({
  phone: phoneSchema,
  length: z.number().int().min(4).max(10).optional(),
  expirySeconds: z.number().int().min(30).max(3600).optional(),
});

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{4,10}$/, "code must be numeric"),
});

const otpRoutes: FastifyPluginAsync = async (app) => {
  const requestOtp = (phone: string) => `otp:ip:${phone}`;

  app.post("/v1/otp/request", async (request, reply) => {
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "invalid request",
      });
    }
    const { phone, length, expirySeconds } = parsed.data;

    const ipKey = requestOtp(request.ip);
    const count = await app.redis.incr(ipKey);
    if (count === 1) await app.redis.expire(ipKey, 900);
    if (count > 20) {
      return reply.code(429).send({ error: "rate_limited", message: "Too many requests from this IP" });
    }

    const result = await app.otpService.requestOtp(request.appId, { phone, length, expirySeconds }, (code, expiryMinutes) =>
      app.whatsapp.sendOtp({ to: phone, code, appName: request.appId, expiryMinutes })
    );

    if (result.status === "rate_limited") {
      return reply.code(429).send(result);
    }
    if (result.status === "cooldown") {
      return reply.code(429).send(result);
    }
    return reply.send(result);
  });

  app.post("/v1/otp/verify", async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "invalid request",
      });
    }

    const result = await app.otpService.verifyOtp(request.appId, parsed.data);
    if (!result.valid) {
      return reply.code(401).send(result);
    }
    return reply.send(result);
  });
};

export default otpRoutes;
