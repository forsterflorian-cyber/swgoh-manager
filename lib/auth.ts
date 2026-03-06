// lib/auth.ts

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
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      // User in unserer DB anlegen/aktualisieren
      try {
        await sql`
          INSERT INTO users (id, name, email, image, updated_at)
          VALUES (gen_random_uuid(), ${user.name}, ${user.email}, ${user.image}, NOW())
          ON CONFLICT (email)
          DO UPDATE SET name = ${user.name}, image = ${user.image}, updated_at = NOW()
        `;
      } catch (error) {
        console.error('Error upserting user:', error);
      }

      return true;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        // User-ID aus unserer DB laden
        const result = await sql`
          SELECT id, ally_code FROM users WHERE email = ${session.user.email}
        `;
        if (result.rows.length > 0) {
          (session.user as any).id = result.rows[0].id;
          (session.user as any).allyCode = result.rows[0].ally_code;
        }
      }
      return session;
    },

    async jwt({ token, user }) {
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