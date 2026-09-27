// All user-facing timestamps and business dates are fixed to India Standard Time.
// Never rely on the device/browser timezone for AquaKart operational dates.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }
  return new Date(date.getTime() + IST_OFFSET_MS);
}

export function getIndiaBusinessDate(): string {
  const d = toISTDate(new Date());
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getIndiaBusinessMonth(): string {
  return getIndiaBusinessDate().slice(0, 7);
}

export function getIndiaHour(): number {
  return toISTDate(new Date()).getUTCHours();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatISTDate(value: string | Date): string {
  const d = toISTDate(value);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatISTTime(value: string | Date): string {
  const d = toISTDate(value);
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strTime = hours.toString().padStart(2, '0') + ':' + minutes + ' ' + ampm;
  return strTime;
}

export function formatISTDateTime(value: string | Date): string {
  return `${formatISTDate(value)} • ${formatISTTime(value)}`;
}
