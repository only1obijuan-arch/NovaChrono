const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayNumber(day) {
  const index = weekdays.indexOf(day);
  if (index === -1) throw new Error("Invalid weekday");
  return index;
}

export function weekdayLabel(day) {
  return weekdays[day] ?? (typeof day === "string" ? day : "");
}
