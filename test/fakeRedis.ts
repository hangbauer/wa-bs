interface Entry {
  value: string;
  expiresAt?: number;
}

export class FakeRedis {
  private store = new Map<string, Entry>();
  private counters = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<"OK"> {
    if (mode === "KEEPTTL") {
      const existing = this.store.get(key);
      this.store.set(key, { value, expiresAt: existing?.expiresAt });
    } else if (mode === "EX" && ttl) {
      this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    } else {
      this.store.set(key, { value });
    }
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      count += this.store.delete(key) ? 1 : 0;
    }
    return count;
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }
}
