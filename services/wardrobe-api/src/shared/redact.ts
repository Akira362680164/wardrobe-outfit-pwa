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
  if (Array.isArray(value)) {
    return value.map(redactSensitiveLogValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSensitiveLogValue(nested),
      ]),
    );
  }

  if (typeof value === "string") {
    return maskPhone(value);
  }

  return value;
}

export function redactedLogSerializer(value: unknown) {
  return redactSensitiveLogValue(value);
}
