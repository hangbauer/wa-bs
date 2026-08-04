import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server.js";
import { FakeRedis } from "./fakeRedis.js";

const env = {
  NODE_ENV: "test",
  API_KEYS: "test-key:test-app",
  WA_ACCESS_TOKEN: "token",
  WA_PHONE_NUMBER_ID: "123",
  WA_TEMPLATE_NAME: "otp_verification",
} as NodeJS.ProcessEnv;

describe("OTP API", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();
    app = await buildServer({ env, redis: redis as never });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects requests without an API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/otp/request",
      payload: { phone: "+6281234567890" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_api_key");
  });

  it("rejects invalid phone numbers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/otp/request",
      headers: { authorization: "Bearer test-key" },
      payload: { phone: "081234567890" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("returns 503 on healthz when redis is down", async () => {
    vi.spyOn(redis, "ping").mockRejectedValue(new Error("down"));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(503);
  });
});

describe("verify flow", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();
    app = await buildServer({ env, redis: redis as never });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("sends a code then verifies it via the API", async () => {
    const sendSpy = vi.spyOn(app.whatsapp, "sendOtp").mockResolvedValue(undefined);

    const sendRes = await app.inject({
      method: "POST",
      url: "/v1/otp/request",
      headers: { authorization: "Bearer test-key" },
      payload: { phone: "+6281234567890" },
    });
    expect(sendRes.statusCode).toBe(200);
    expect(sendRes.json().status).toBe("sent");

    const code = sendSpy.mock.calls[0]![0].code;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await app.inject({
      method: "POST",
      url: "/v1/otp/verify",
      headers: { authorization: "Bearer test-key" },
      payload: { phone: "+6281234567890", code: "000000" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().valid).toBe(false);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/otp/verify",
      headers: { authorization: "Bearer test-key" },
      payload: { phone: "+6281234567890", code },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().valid).toBe(true);
  });
});
