import type { Config } from "../config.js";

export interface SendOtpInput {
  to: string;
  code: string;
  appName: string;
  expiryMinutes: number;
}

export class WhatsAppService {
  constructor(private readonly cfg: Config) {}

  private get baseUrl() {
    return `https://graph.facebook.com/${this.cfg.WA_API_VERSION}`;
  }

  async sendOtp({ to, code, appName, expiryMinutes }: SendOtpInput): Promise<void> {
    if (!this.cfg.WA_ACCESS_TOKEN || !this.cfg.WA_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp not configured (WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID)");
    }

    const res = await fetch(
      `${this.baseUrl}/${this.cfg.WA_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          this.cfg.WA_SEND_MODE === "text"
            ? {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: {
                  body: `Your verification code is ${code}. It expires in ${expiryMinutes} minutes.`,
                },
              }
            : {
                messaging_product: "whatsapp",
                to,
                type: "template",
                template: {
                  name: this.cfg.WA_TEMPLATE_NAME,
                  language: { code: this.cfg.WA_TEMPLATE_LANGUAGE },
                  components: [
                    {
                      type: "body",
                      parameters: [
                        { type: "text", text: code },
                        { type: "text", text: String(expiryMinutes) },
                      ],
                    },
                  ],
                },
              }
        ),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${body.slice(0, 500)}`);
    }
  }
}
