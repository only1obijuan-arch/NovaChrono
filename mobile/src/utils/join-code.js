export function isValidJoinCode(value) {
  return typeof value === "string" && /^(?:[A-Z0-9]{6}|[A-Z0-9]{8})$/i.test(value.trim());
}
