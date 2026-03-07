import { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import { sql } from '@vercel/postgres';

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

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
        console.error('Database error during signIn:', error);
        return true; 
      }
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        try {
          // Wir holen die ID und den Ally-Code aus der Postgres DB
          const result = await sql`
            SELECT id, ally_code FROM users WHERE email = ${session.user.email}
          `;
          if (result.rows.length > 0) {
            (session.user as any).id = result.rows[0].id;
            (session.user as any).allyCode = result.rows[0].ally_code;
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