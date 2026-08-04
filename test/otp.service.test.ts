import { describe, expect, it, vi } from "vitest";
import { OtpService } from "../src/services/otp.service.js";
import { FakeRedis } from "./fakeRedis.js";
import { loadConfig } from "../src/config.js";

const env = {
  NODE_ENV: "test",
  API_KEYS: "k1:app1",
  WA_ACCESS_TOKEN: "token",
  WA_PHONE_NUMBER_ID: "123",
} as NodeJS.ProcessEnv;

function makeService(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const cfg = loadConfig({ ...env, ...overrides });
  return new OtpService(new FakeRedis() as never, cfg);
}

describe("OtpService", () => {
  it("generates a numeric code of configured length and stores a record", async () => {
    const service = makeService();
    const send = vi.fn<(code: string, minutes: number) => Promise<void>>();

    const result = await service.requestOtp("app1", { phone: "+6281234567890" }, send);

    expect(result.status).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    const [code, minutes] = send.mock.calls[0]!;
    expect(code).toMatch(/^\d{6}$/);
    expect(minutes).toBe(5);
  });

  it("respects per-call length and expiry", async () => {
    const service = makeService();
    const send = vi.fn();

    await service.requestOtp(
      "app1",
      { phone: "+6281234567890", length: 4, expirySeconds: 60 },
      send
    );

    expect(send.mock.calls[0]![0]).toMatch(/^\d{4}$/);
    expect(send.mock.calls[0]![1]).toBe(1);
  });

  it("rejects a second request during the cooldown window", async () => {
    const service = makeService();
    const send = vi.fn();

    await service.requestOtp("app1", { phone: "+6281234567890" }, send);
    const second = await service.requestOtp("app1", { phone: "+6281234567890" }, send);

    expect(second.status).toBe("cooldown");
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
    expect(send).toHaveBeenCalledOnce();
  });

  it("rate limits beyond the per-hour quota", async () => {
    const service = makeService({ OTP_MAX_PER_PHONE_PER_HOUR: "2", OTP_RESEND_COOLDOWN_SECONDS: "0" });
    const send = vi.fn();

    await service.requestOtp("app1", { phone: "+6281234567890" }, send);
    await service.requestOtp("app1", { phone: "+6281234567890" }, send);
    const third = await service.requestOtp("app1", { phone: "+6281234567890" }, send);

    expect(third.status).toBe("rate_limited");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("deletes the pending OTP if sending fails, allowing a retry", async () => {
    const service = makeService();
    const failSend = vi.fn().mockRejectedValue(new Error("whatsapp down"));

    await expect(
      service.requestOtp("app1", { phone: "+6281234567890" }, failSend)
    ).rejects.toThrow("whatsapp down");

    const send = vi.fn();
    const retry = await service.requestOtp("app1", { phone: "+6281234567890" }, send);
    expect(retry.status).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
  });

  it("verifies a correct code and consumes it", async () => {
    const service = makeService();
    const send = vi.fn();

    await service.requestOtp("app1", { phone: "+6281234567890" }, send);
    const code = send.mock.calls[0]![0];

    const result = await service.verifyOtp("app1", { phone: "+6281234567890", code });
    expect(result.valid).toBe(true);

    const again = await service.verifyOtp("app1", { phone: "+6281234567890", code });
    expect(again.valid).toBe(false);
    expect(again.reason).toBe("expired");
  });

  it("rejects a wrong code and reports attempts left", async () => {
    const service = makeService();
    const send = vi.fn();

    await service.requestOtp("app1", { phone: "+6281234567890" }, send);

    const result = await service.verifyOtp("app1", { phone: "+6281234567890", code: "000000" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("wrong_code");
    expect(result.attemptsLeft).toBe(4);
  });

  it("locks after max attempts", async () => {
    const service = makeService({ OTP_MAX_ATTEMPTS: "2" });
    const send = vi.fn();

    await service.requestOtp("app1", { phone: "+6281234567890" }, send);

    await service.verifyOtp("app1", { phone: "+6281234567890", code: "000000" });
    const second = await service.verifyOtp("app1", { phone: "+6281234567890", code: "000000" });

    expect(second.valid).toBe(false);
    expect(second.reason).toBe("too_many_attempts");
  });

  it("reports expired when no record exists", async () => {
    const service = makeService();
    const result = await service.verifyOtp("app1", { phone: "+6281234567890", code: "123456" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });
});
