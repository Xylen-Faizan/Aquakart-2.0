// All user-facing timestamps and business dates are fixed to India Standard Time.
// Never rely on the device/browser timezone for AquaKart operational dates.

const IST = "Asia/Kolkata";

function assertValidDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }
  return date;
}

export function getIndiaBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function getIndiaBusinessMonth(): string {
  return getIndiaBusinessDate().slice(0, 7);
}

export function getIndiaHour(): number {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

export function formatISTDate(value: string | Date): string {
  return assertValidDate(value).toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatISTTime(value: string | Date): string {
  return assertValidDate(value).toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatISTDateTime(value: string | Date): string {
  const date = assertValidDate(value);
  return `${date.toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} • ${date.toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
}
