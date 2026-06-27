const SENSITIVE_KEY_PATTERN =
  /password|passwordHash|token|accessToken|refreshToken|clientSecret|authorization|cookie/i;

const PHONE_E164_PATTERN = /\+?\d{7,15}/g;

function maskPhone(value: string) {
  return value.replace(PHONE_E164_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) {
      return "[REDACTED_PHONE]";
    }
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  });
}

export function redactSensitiveLogValue(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return value.map((item) => redactValue(item, seen, depth + 1));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(nested, seen, depth + 1),
      ]),
    );
  }

  if (typeof value === "string") {
    return maskPhone(value);
  }

  return value;
}

export function redactedLogSerializer(value: unknown) {
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const raw = candidate.raw && typeof candidate.raw === "object" ? candidate.raw as Record<string, unknown> : null;
    const method = candidate.method ?? raw?.method;
    const url = candidate.url ?? raw?.url;
    if (typeof method === "string" && typeof url === "string") {
      return { id: candidate.id, method, url: maskPhone(url) };
    }
    if (typeof candidate.statusCode === "number") return { statusCode: candidate.statusCode };
    if (candidate.raw && typeof (candidate.raw as Record<string, unknown>).statusCode === "number") {
      return { statusCode: (candidate.raw as Record<string, unknown>).statusCode };
    }
  }
  return redactSensitiveLogValue(value);
}
