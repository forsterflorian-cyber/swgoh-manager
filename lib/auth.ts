import { sql } from '@vercel/postgres';
import { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

type SessionUser = {
  email?: string | null;
  id?: string;
  allyCode?: string | null;
};

function getRequiredEnv(name: 'DISCORD_CLIENT_ID' | 'DISCORD_CLIENT_SECRET'): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: getRequiredEnv('DISCORD_CLIENT_ID'),
      clientSecret: getRequiredEnv('DISCORD_CLIENT_SECRET'),
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      const MAX_RETRIES = 2;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await sql`
            INSERT INTO users (name, email, image, updated_at)
            VALUES (${user.name}, ${user.email}, ${user.image}, NOW())
            ON CONFLICT (email)
            DO UPDATE SET
              name = EXCLUDED.name,
              image = EXCLUDED.image,
              updated_at = NOW()
          `;
          return true;
        } catch (error) {
          lastError = error;
          console.error(`Database error during signIn (attempt ${attempt + 1}/${MAX_RETRIES}):`, error);
          
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
      }

      console.error('All signIn attempts failed:', lastError);
      return '/login?error=database_error';
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        try {
          const result = await sql`
            SELECT id, ally_code
            FROM users
            WHERE email = ${session.user.email}
          `;

          if (result.rows.length > 0) {
            const sessionUser = session.user as SessionUser;
            sessionUser.id = result.rows[0].id;
            sessionUser.allyCode = result.rows[0].ally_code;
          }
        } catch (error) {
          console.error('Session callback error:', error);
        }
      }

      return session;
    },
    async jwt({ token }) {
      return token;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
