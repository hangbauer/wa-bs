# WhatsApp Business OTP API

An internal HTTP API that lets your other apps request and verify one-time passwords (OTPs) delivered via the official Meta WhatsApp Cloud API.

## Architecture

```
┌─────────┐  POST /v1/otp/request   ┌──────────────┐   Meta Graph API   ┌─────────┐
│ Your app │ ─────────────────────▶ │  wa-bs API   │ ─────────────────▶ │WhatsApp │
│ (appKey) │ ◀───────────────────── │  + Redis     │                    └─────────┘
└─────────┘  POST /v1/otp/verify    └──────────────┘
```

- **Meta Cloud API** – official, template-based messaging (no ban risk).
- **Redis** – OTP storage with TTL expiry, attempt counters, resend cooldown, and rate limiting. Atomic and shared across instances.
- **Fastify + TypeScript** – small, fast, schema-validated requests.

## Flow

1. Your app calls `POST /v1/otp/request` with a phone number.
2. The API generates a random numeric code, stores its **SHA-256 hash** in Redis with a TTL, and sends it via a pre-approved WhatsApp message template.
3. Your app calls `POST /v1/otp/verify` with the phone and the code the user entered.
4. The API compares hashes (constant-time), consumes the code on success, and limits attempts (default 5). OTPs are single-use and expire (default 5 min).

## Setup

```bash
npm install
cp .env.example .env     # fill in your values
docker compose up -d     # starts Redis
npm run dev
```

### Prerequisites (Meta WhatsApp Cloud API)

1. Create a Meta developer app at developers.facebook.com → add the WhatsApp product.
2. Add a test number (or connect your WhatsApp Business account / phone number).
3. Create a message template, e.g. `otp_verification` with body:
   `Your verification code is {{1}}. It expires in {{2}} minutes.`
4. Set in `.env`:
   - `WA_ACCESS_TOKEN` – the temporary/permanent access token
   - `WA_PHONE_NUMBER_ID` – from the WhatsApp settings page
   - `WA_TEMPLATE_NAME` – your template name (default `otp_verification`)
5. Register the webhook `https://<your-host>/webhook/whatsapp` with the verify token `WA_WEBHOOK_VERIFY_TOKEN` to receive delivery statuses.

> Note: business-initiated messages (templates) are the only way to message a user before they message you. There are also free-form text limits (1,000 conversations per 24h) before business verification.

## API

All endpoints except `/healthz` and `/webhook/whatsapp` require `Authorization: Bearer <key>` where the key is one of the `API_KEYS` you configured (format `key:appName`).

### `POST /v1/otp/request`

```json
{ "phone": "+6281234567890", "length": 6, "expirySeconds": 300 }
```

| Field          | Required | Default | Description                       |
| -------------- | -------- | ------- | --------------------------------- |
| `phone`        | yes      | –       | E.164 format, e.g. `+6281234567890` |
| `length`       | no       | 6       | Code length (4–10)                |
| `expirySeconds`| no       | 300     | Code validity (30–3600)           |

Responses:

- `200` – `{ "status": "sent" }`
- `429` – `{ "status": "cooldown", "retryAfterSeconds": 45 }` (resend too soon)
- `429` – `{ "status": "rate_limited" }` (hourly per-phone or per-IP quota exceeded)

### `POST /v1/otp/verify`

```json
{ "phone": "+6281234567890", "code": "482913" }
```

- `200` – `{ "valid": true }`
- `401` – `{ "valid": false, "reason": "wrong_code" | "expired" | "too_many_attempts", "attemptsLeft": 3 }`

## Security

- OTPs stored hashed (SHA-256), never logged; compared with `timingSafeEqual`.
- Single-use, TTL expiry, max attempt lockout.
- Resend cooldown + per-phone (hourly) + per-IP (15 min) rate limits.
- Per-app API keys; each key identifies a consumer app in audit logs.

## Ops

```bash
npm run typecheck   # TS check
npm test            # unit + API tests (no external deps)
npm run build       # compile to dist/
```

Redis keys (all auto-expire):

```
otp:v1:<appId>:<phone>              # JSON {hash, attempts, createdAt} — TTL = expiry
otp:cooldown:<appId>:<phone>        # blocks resend — TTL = cooldown
otp:rl:<appId>:<phone>:<hour>       # hourly counter
otp:ip:<ip>                         # per-IP counter — TTL = 15 min
```

## Docker

```bash
docker build -t wa-bs .
docker run --env-file .env -p 3000:3000 wa-bs
```
