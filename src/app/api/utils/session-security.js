export const PRESERVED_SESSION_BOUNDARY = new Date(0).toISOString();

export function isSessionCurrent(issuedAtMs, sessionsValidAfter) {
  const issued = Number(issuedAtMs);
  const boundary = new Date(sessionsValidAfter).getTime();
  return Number.isFinite(issued) && Number.isFinite(boundary) && issued >= boundary;
}

export async function invalidateUserSessions(txSql, userId) {
  await txSql`
    UPDATE auth_users
    SET sessions_valid_after = NOW()
    WHERE id = ${userId}
  `;
  await txSql`DELETE FROM mobile_sessions WHERE user_id = ${userId}`;
}
