export interface OtpRecord {
  hash: string;
  attempts: number;
  createdAt: number;
}

export interface RequestOtpParams {
  phone: string;
  length?: number;
  expirySeconds?: number;
}

export interface RequestOtpResult {
  status: "sent" | "cooldown" | "rate_limited";
  message: string;
  retryAfterSeconds?: number;
}

export interface VerifyOtpParams {
  phone: string;
  code: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  reason?: "wrong_code" | "expired" | "too_many_attempts";
  attemptsLeft?: number;
}
