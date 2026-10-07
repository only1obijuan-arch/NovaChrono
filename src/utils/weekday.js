const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayNumber(day) {
  const index = weekdays.indexOf(day);
  if (index === -1) throw new Error("Invalid weekday");
  return index;
}

export function weekdayLabel(day) {
  const numericDay =
    typeof day === "string" && /^\d+$/.test(day.trim())
      ? Number(day)
      : day;

  if (Number.isInteger(numericDay) && numericDay >= 0 && numericDay < weekdays.length) {
    return weekdays[numericDay];
  }

  if (typeof day === "string") {
    const normalized = day.trim().toLowerCase();
    return weekdays.find((weekday) => weekday.toLowerCase() === normalized) ?? "";
  }

  return "";
}

export function leagueDayLabel(day) {
  const label = weekdayLabel(day);
  return label ? `${label.toUpperCase()} LEAGUE` : "LEAGUE";
}
