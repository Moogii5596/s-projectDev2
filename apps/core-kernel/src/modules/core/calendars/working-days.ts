export function workingDaysBetween(start: string, end: string, holidayKeys: ReadonlySet<string> = new Set()): number {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (endDate < startDate) throw new RangeError('end must be on or after start');

  let count = 0;
  for (let date = startDate; date < endDate; date = addDay(date)) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const [, month, day] = date.split('-');
    if (weekday !== 0 && weekday !== 6 && !holidayKeys.has(date) && !holidayKeys.has(`--${month}-${day}`)) count++;
  }
  return count;
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('date must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError('date is invalid');
  }
  return value;
}

function addDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
