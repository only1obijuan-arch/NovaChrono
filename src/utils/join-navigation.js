import { isValidJoinCode } from "./join-code";

export function withJoinCode(path, code) {
  return isValidJoinCode(code) ? `${path}?code=${encodeURIComponent(code.trim().toUpperCase())}` : path;
}
