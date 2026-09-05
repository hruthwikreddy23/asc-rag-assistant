const CENTRAL_TIME_ZONE = "America/Chicago";

function getCentralParts(date: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  return { hour, weekday };
}

export function timeAwareGreeting(date: Date = new Date()): string {
  const { hour } = getCentralParts(date);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Office hours: Mon-Fri, 9am-5pm Central. */
export function isWithinOfficeHours(date: Date = new Date()): boolean {
  const { hour, weekday } = getCentralParts(date);
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";
  return isWeekday && hour >= 9 && hour < 17;
}
