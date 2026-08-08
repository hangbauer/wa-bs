import { z } from "zod";

const apiKeysSchema = z
  .string()
  .min(1)
  .transform((raw) => {
    const pairs = raw.split(",").map((p) => p.trim()).filter(Boolean);
    const map = new Map<string, string>();
    for (const pair of pairs) {
      const [key, app] = pair.split(":");
      if (!key || !app) throw new Error(`Invalid API_KEYS entry: "${pair}"`);
      map.set(key, app);
    }
    return map;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_KEYS: apiKeysSchema,
  WA_API_VERSION: z.string().default("v22.0"),
  WA_ACCESS_TOKEN: z.string().default(""),
  WA_PHONE_NUMBER_ID: z.string().default(""),
  WA_TEMPLATE_NAME: z.string().default("otp_verification"),
  WA_TEMPLATE_LANGUAGE: z.string().default("en"),
  WA_SEND_MODE: z.enum(["template", "text"]).default("template"),
  WA_WEBHOOK_VERIFY_TOKEN: z.string().default(""),
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  OTP_MAX_PER_PHONE_PER_HOUR: z.coerce.number().int().min(1).max(100).default(10),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
