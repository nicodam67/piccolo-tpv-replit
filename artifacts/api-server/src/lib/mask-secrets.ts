const SENSITIVE_KEY = /(secret|password|private.?key|api.?key|access.?key|refresh.?token|device.?token|webhook.?secret|credential)/i;
const PUBLIC_KEY = /(publishable|public)/i;

export function maskSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskSecrets) as T;
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key) && !PUBLIC_KEY.test(key)) {
      result[key] = entry ? "***" : entry;
    } else if (/^token$/i.test(key)) {
      result[key] = entry ? "***" : entry;
    } else {
      result[key] = maskSecrets(entry);
    }
  }
  return result as T;
}

export function withoutBearerToken<T extends Record<string, unknown>>(value: T) {
  const { token: _token, deviceToken: _deviceToken, ...safe } = value;
  return {
    ...safe,
    hasToken: Boolean(_token ?? _deviceToken),
  };
}
