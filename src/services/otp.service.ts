import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Redis } from "ioredis";
import type { Config } from "../config.js";
import type {
  OtpRecord,
  RequestOtpParams,
  RequestOtpResult,
  VerifyOtpParams,
  VerifyOtpResult,
} from "../types.js";

const KEY_VERSION = 1;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(length: number): string {
  const digits = new Array<string>(length);
  for (let i = 0; i < length; i++) {
    digits[i] = String(randomInt(0, 10));
  }
  return digits.join("");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class OtpService {
  constructor(
    private readonly redis: Redis,
    private readonly cfg: Config
  ) {}

  private otpKey(appId: string, phone: string) {
    return `otp:v${KEY_VERSION}:${appId}:${phone}`;
  }

  private cooldownKey(appId: string, phone: string) {
    return `otp:cooldown:${appId}:${phone}`;
  }

  private rateLimitKey(appId: string, phone: string, now: number) {
    const hour = Math.floor(now / 3_600_000);
    return `otp:rl:${appId}:${phone}:${hour}`;
  }

  async requestOtp(
    appId: string,
    params: RequestOtpParams,
    send: (code: string, expiryMinutes: number) => Promise<void>
  ): Promise<RequestOtpResult> {
    const cfg = this.cfg;
    const length = params.length ?? cfg.OTP_LENGTH;
    const expirySeconds = params.expirySeconds ?? cfg.OTP_EXPIRY_SECONDS;
    const now = Date.now();

    const [cooldownTtl, rateCount] = await Promise.all([
      this.redis.ttl(this.cooldownKey(appId, params.phone)),
      this.redis.incr(this.rateLimitKey(appId, params.phone, now)),
    ]);

    if (rateCount === 1) {
      await this.redis.expire(this.rateLimitKey(appId, params.phone, now), 3600);
    }
    if (rateCount > cfg.OTP_MAX_PER_PHONE_PER_HOUR) {
      return { status: "rate_limited", message: "Too many requests for this phone number" };
    }

    if (cooldownTtl > 0) {
      return {
        status: "cooldown",
        message: "Please wait before requesting a new code",
        retryAfterSeconds: cooldownTtl,
      };
    }

    const code = generateCode(length);
    const record: OtpRecord = {
      hash: hashCode(code),
      attempts: 0,
      createdAt: now,
    };
    const expiryMinutes = Math.max(1, Math.round(expirySeconds / 60));

    try {
      await send(code, expiryMinutes);
    } catch (err) {
      await this.redis.del(this.otpKey(appId, params.phone));
      throw err;
    }

    await Promise.all([
      this.redis.set(
        this.otpKey(appId, params.phone),
        JSON.stringify(record),
        "EX",
        expirySeconds
      ),
      this.redis.set(this.cooldownKey(appId, params.phone), "1", "EX", cfg.OTP_RESEND_COOLDOWN_SECONDS),
    ]);

    return { status: "sent", message: "Code sent" };
  }

  async verifyOtp(appId: string, params: VerifyOtpParams): Promise<VerifyOtpResult> {
    const raw = await this.redis.get(this.otpKey(appId, params.phone));
    if (!raw) {
      return { valid: false, reason: "expired" };
    }

    let record: OtpRecord;
    try {
      record = JSON.parse(raw) as OtpRecord;
    } catch {
      await this.redis.del(this.otpKey(appId, params.phone));
      return { valid: false, reason: "expired" };
    }

    if (record.attempts >= this.cfg.OTP_MAX_ATTEMPTS) {
      await this.redis.del(this.otpKey(appId, params.phone));
      return { valid: false, reason: "too_many_attempts" };
    }

    if (safeEqual(record.hash, hashCode(params.code))) {
      await this.redis.del(this.otpKey(appId, params.phone));
      return { valid: true };
    }

    const attempts = record.attempts + 1;
    await this.redis.set(
      this.otpKey(appId, params.phone),
      JSON.stringify({ ...record, attempts }),
      "KEEPTTL"
    );

    const attemptsLeft = this.cfg.OTP_MAX_ATTEMPTS - attempts;
    return {
      valid: false,
      reason: attemptsLeft <= 0 ? "too_many_attempts" : "wrong_code",
      attemptsLeft: Math.max(0, attemptsLeft),
    };
  }
}
