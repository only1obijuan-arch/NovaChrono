export function canonicalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function canonicalizeAccountIdentifier(provider, value) {
  const identifier = String(value ?? "");
  return provider?.startsWith("credentials")
    ? canonicalizeEmail(identifier) || identifier.trim()
    : identifier;
}
