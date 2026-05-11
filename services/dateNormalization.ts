const COLOMBIA_TIMEZONE_OFFSET = '-05:00';
const COLOMBIA_TIMEZONE = 'America/Bogota';
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;
const MAX_CORRECTION_AGE_MS = 60 * 24 * 60 * 60 * 1000;

type TimestampRecord = {
  timestamp: string;
  source?: string;
};

const bogotaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: COLOMBIA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function getBogotaParts(date: Date) {
  const parts = Object.fromEntries(
    bogotaFormatter.formatToParts(date).map(part => [part.type, part.value])
  );

  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function buildBogotaIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): string | null {
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  if (
    dateOnly.getUTCFullYear() !== year ||
    dateOnly.getUTCMonth() !== month - 1 ||
    dateOnly.getUTCDate() !== day
  ) {
    return null;
  }

  const parsed = new Date(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}` +
    COLOMBIA_TIMEZONE_OFFSET
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function normalizeFagorTimestamp(timestamp: string, source?: string): string {
  if (source !== 'FAGOR') return timestamp;

  const originalDate = new Date(timestamp);
  if (Number.isNaN(originalDate.getTime())) return timestamp;

  const now = Date.now();
  if (originalDate.getTime() <= now + FUTURE_TOLERANCE_MS) return timestamp;

  const parts = getBogotaParts(originalDate);
  const correctedMonth = parts.day;
  const correctedDay = parts.month;

  if (correctedMonth < 1 || correctedMonth > 12) return timestamp;

  const corrected = buildBogotaIso(
    parts.year,
    correctedMonth,
    correctedDay,
    parts.hour,
    parts.minute,
    parts.second
  );

  if (!corrected) return timestamp;

  const correctedTime = new Date(corrected).getTime();
  if (
    correctedTime > now + FUTURE_TOLERANCE_MS ||
    correctedTime < now - MAX_CORRECTION_AGE_MS
  ) {
    return timestamp;
  }

  return corrected;
}

export function normalizeAlertTimestamp<T extends TimestampRecord>(record: T): T {
  const timestamp = normalizeFagorTimestamp(record.timestamp, record.source);
  return timestamp === record.timestamp ? record : { ...record, timestamp };
}
