/** The next occurrence of an ISO weekday, including today, in the tenant's calendar. */
export function nextLessonDate(today: string, dayOfWeek: number): string {
  const date = new Date(`${today}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + ((dayOfWeek - weekday + 7) % 7));
  return date.toISOString().slice(0, 10);
}
