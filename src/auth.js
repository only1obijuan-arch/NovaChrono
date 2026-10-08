import { reserveLoginAttempt, clearLoginAttempts } from "@/app/api/utils/login-limit";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "argon2";
import { pool } from "@/app/api/utils/db";
import { canonicalizeAccountIdentifier, canonicalizeEmail } from "@/app/api/utils/email";
import { isSessionCurrent } from "@/app/api/utils/session-security";

// NeonDB Adapter
function Adapter(client) {
  return {
    async createUser(user) {
      const { name, email, emailVerified, image } = user;
      const result = await client.query(
        `INSERT INTO auth_users (name, email, "emailVerified", image)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, "emailVerified", image`,
        [name, canonicalizeEmail(email), emailVerified, image]
      );
      return result.rows[0];
    },
    async getUser(id) {
      try {
        const result = await client.query(
          "SELECT * FROM auth_users WHERE id = $1",
          [id]
        );
        return result.rowCount === 0 ? null : result.rows[0];
      } catch {
        return null;
      }
    },
    async getUserByEmail(email) {
      const result = await client.query(
        "SELECT * FROM auth_users WHERE lower(email) = $1",
        [canonicalizeEmail(email)]
      );
      if (result.rowCount === 0) return null;
      const userData = result.rows[0];
      const accountsData = await client.query(
        'SELECT * FROM auth_accounts WHERE "userId" = $1',
        [userData.id]
      );
      return { ...userData, accounts: accountsData.rows };
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const result = await client.query(
        `SELECT u.* FROM auth_users u
         JOIN auth_accounts a ON u.id = a."userId"
         WHERE a.provider = $1 AND a."providerAccountId" = $2`,
        [provider, canonicalizeAccountIdentifier(provider, providerAccountId)]
      );
      return result.rowCount !== 0 ? result.rows[0] : null;
    },
    async updateUser(user) {
      const query1 = await client.query(
        "SELECT * FROM auth_users WHERE id = $1",
        [user.id]
      );
      const oldUser = query1.rows[0];
      const newUser = { ...oldUser, ...user };
      const { id, name, email, emailVerified, image } = newUser;
      const result = await client.query(
        `UPDATE auth_users SET name=$2, email=$3, "emailVerified"=$4, image=$5
         WHERE id=$1
         RETURNING id, name, email, "emailVerified", image`,
        [id, name, canonicalizeEmail(email), emailVerified, image]
      );
      return result.rows[0];
    },
    async linkAccount(account) {
      const result = await client.query(
        `INSERT INTO auth_accounts
         ("userId", provider, type, "providerAccountId", access_token,
          expires_at, refresh_token, id_token, scope, session_state,
          token_type, password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          account.userId,
          account.provider,
          account.type,
          canonicalizeAccountIdentifier(account.provider, account.providerAccountId),
          account.access_token,
          account.expires_at,
          account.refresh_token,
          account.id_token,
          account.scope,
          account.session_state,
          account.token_type,
          account.extraData?.password,
        ]
      );
      return result.rows[0];
    },
    async createSession({ sessionToken, userId, expires }) {
      const result = await client.query(
        `INSERT INTO auth_sessions ("userId", expires, "sessionToken")
         VALUES ($1,$2,$3)
         RETURNING *`,
        [userId, expires, sessionToken]
      );
      return result.rows[0];
    },
    async getSessionAndUser(sessionToken) {
      if (!sessionToken) return null;
      const result1 = await client.query(
        'SELECT * FROM auth_sessions WHERE "sessionToken" = $1',
        [sessionToken]
      );
      if (result1.rowCount === 0) return null;
      const session = result1.rows[0];
      const result2 = await client.query(
        "SELECT * FROM auth_users WHERE id = $1",
        [session.userId]
      );
      if (result2.rowCount === 0) return null;
      return { session, user: result2.rows[0] };
    },
    async updateSession(session) {
      const result1 = await client.query(
        'SELECT * FROM auth_sessions WHERE "sessionToken" = $1',
        [session.sessionToken]
      );
      if (result1.rowCount === 0) return null;
      const newSession = { ...result1.rows[0], ...session };
      const result = await client.query(
        `UPDATE auth_sessions SET expires=$2
         WHERE "sessionToken"=$1 RETURNING *`,
        [newSession.sessionToken, newSession.expires]
      );
      return result.rows[0];
    },
    async deleteSession(sessionToken) {
      await client.query(
        'DELETE FROM auth_sessions WHERE "sessionToken" = $1',
        [sessionToken]
      );
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await client.query(
        'DELETE FROM auth_accounts WHERE "providerAccountId"=$1 AND provider=$2',
        [canonicalizeAccountIdentifier(provider, providerAccountId), provider]
      );
    },
    async deleteUser(userId) {
      await client.query("DELETE FROM auth_users WHERE id=$1", [userId]);
      await client.query('DELETE FROM auth_sessions WHERE "userId"=$1', [userId]);
      await client.query('DELETE FROM auth_accounts WHERE "userId"=$1', [userId]);
    },
    async createVerificationToken({ identifier, expires, token }) {
      await client.query(
        `INSERT INTO auth_verification_token (identifier, expires, token)
         VALUES ($1,$2,$3)`,
        [identifier, expires, token]
      );
      return { identifier, expires, token };
    },
    async useVerificationToken({ identifier, token }) {
      const result = await client.query(
        `DELETE FROM auth_verification_token
         WHERE identifier=$1 AND token=$2
         RETURNING identifier, expires, token`,
        [identifier, token]
      );
      return result.rowCount !== 0 ? result.rows[0] : null;
    },
  };
}

const nextAuth = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Pin the authentication attempt before password verification begins.
        // A concurrent password reset must be able to invalidate this attempt
        // even if the expensive password check completes afterwards.
        const authenticationStartedAt = Date.now();
        const { email, password } = credentials;

        if (!email || !password) return null;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const canonicalEmail = canonicalizeEmail(email);
        if (!(await reserveLoginAttempt(canonicalEmail))) return null;

        const user = await Adapter(pool).getUserByEmail(canonicalEmail);

        // Signin flow
        if (!user) return null;

        const matchingAccount = user.accounts?.find(
          (a) => a.provider === "credentials" ||
                 a.provider === "credentials-signin" ||
                 a.provider === "credentials-signup"
        );
        if (!matchingAccount?.password) return null;

        const isValid = await verify(matchingAccount.password, password);
        if (!isValid) return null;

        if (!user.emailVerified) {
        return null;
        }

        await clearLoginAttempts(canonicalEmail);
        return { ...user, session_issued_at: authenticationStartedAt };
      },
    }),
      ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.session_issued_at = user.session_issued_at ?? token.session_issued_at ?? Date.now();
      } else if (token.session_issued_at == null && Number.isFinite(Number(token.iat))) {
        // Upgrade a legacy cookie once. Auth.js can refresh `iat` whenever it
        // re-encodes a JWT, so all future checks must use this pinned value.
        token.session_issued_at = Number(token.iat) * 1000;
      }

      if (!token.id) return revokedToken(token);

      let liveUser;
      try {
        const result = await pool.query(
          `SELECT id, email, name, role, venue_id, organization_id, field_number, sessions_valid_after
           FROM auth_users WHERE id = $1`,
          [token.id]
        );
        liveUser = result.rows[0];
      } catch (error) {
        console.error("[auth.jwt] live user lookup failed", error);
        return revokedToken(token);
      }

      const issuedAtMs = token.session_issued_at;
      if (!liveUser || !isSessionCurrent(issuedAtMs, liveUser.sessions_valid_after)) {
        return revokedToken(token);
      }

      token.revoked = false;
      token.email = liveUser.email;
      token.name = liveUser.name;
      token.role = liveUser.role;
      token.venue_id = liveUser.venue_id;
      token.organization_id = liveUser.organization_id;
      token.field_number = liveUser.field_number;
      return token;
    },
    async session({ session, token }) {
      if (token?.revoked) {
        session.user = null;
      } else if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.venue_id = token.venue_id;
        session.user.organization_id = token.organization_id;
        session.user.field_number = token.field_number;
      }
      return session;
    },
  },
  pages: {
    signIn: "/account/signin",
    signOut: "/account/logout",
  },
  session: {
    strategy: "jwt",
  },
});
export const { auth, handlers, signIn, signOut } = nextAuth;

function revokedToken(token) {
  const revoked = { ...token, revoked: true };
  delete revoked.email;
  delete revoked.name;
  delete revoked.role;
  delete revoked.venue_id;
  delete revoked.organization_id;
  delete revoked.field_number;
  return revoked;
}
