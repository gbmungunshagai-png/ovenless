const TTL_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i;

const MULTIPLIERS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** Parse duration strings like `10m`, `7d`, `1h` or a number of seconds */
export function parseTtl(ttl: string | number): number {
  if (typeof ttl === "number") {
    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new Error(`Invalid TTL: ${ttl} (expected positive number of seconds)`);
    }
    return ttl;
  }

  const trimmed = ttl.trim();
  const asNumber = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(asNumber) && !trimmed.match(/[a-z]/i)) {
    if (asNumber <= 0) throw new Error(`Invalid TTL: ${ttl}`);
    return asNumber;
  }

  const match = TTL_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid TTL: "${ttl}" (use e.g. 10m, 7d, 1h, or seconds as a number)`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  return Math.floor(value * MULTIPLIERS[unit]!);
}
