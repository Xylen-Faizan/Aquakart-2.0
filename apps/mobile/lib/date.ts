// Returns the current date in 'YYYY-MM-DD' format according to India Standard Time (IST).
export function getIndiaBusinessDate(): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  
  // Format produces something like "15/09/2026" (depending on locale)
  // To ensure robust YYYY-MM-DD parsing, we extract the parts
  const formatter = new Intl.DateTimeFormat('en-IN', options);
  const parts = formatter.formatToParts(new Date());
  
  let year = '';
  let month = '';
  let day = '';
  
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  
  return `${year}-${month}-${day}`;
}
