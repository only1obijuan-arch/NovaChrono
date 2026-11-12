import { withTransaction } from "@/app/api/utils/db";

export async function assignPushToken(userId, token) {
  try {
    return await withTransaction(async (txSql) => {
      const locked = await txSql`
        SELECT id
        FROM auth_users
        WHERE (id = ${userId} OR push_token = ${token})
          AND account_status = 'active'
        ORDER BY id
        FOR UPDATE
      `;
      if (!locked.some((row) => row.id === userId)) return { status: "not_found" };
      await txSql`
        UPDATE auth_users
        SET push_token = NULL
        WHERE push_token = ${token} AND id <> ${userId}
      `;
      await txSql`
        UPDATE auth_users
        SET push_token = ${token}
        WHERE id = ${userId} AND account_status = 'active'
      `;
      return { status: "registered" };
    });
  } catch (error) {
    if (error?.code === "23505") return { status: "conflict" };
    throw error;
  }
}
