// lib/auth.ts
// ... (Imports bleiben gleich)

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      // Erzwingt die E-Mail Abfrage bei Discord
      authorization: { params: { scope: 'identify email' } },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // DEBUG: Schau in die Vercel-Logs, ob hier eine Email ankommt
      console.log("Login Versuch für:", user.email);
      
      if (!user.email) {
        console.error("Login abgelehnt: Keine Email von Discord erhalten.");
        return false; 
      }

      try {
        await sql`
          INSERT INTO users (id, name, email, image, updated_at)
          VALUES (gen_random_uuid(), ${user.name || ''}, ${user.email}, ${user.image || ''}, NOW())
          ON CONFLICT (email)
          DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, updated_at = NOW()
        `;
        return true;
      } catch (error) {
        console.error('Datenbank-Fehler beim Login:', error);
        // Wir lassen den User trotzdem rein, auch wenn das DB-Update fehlschlägt
        // Er hat dann halt keine ID/AllyCode in der Session
        return true; 
      }
    },
    // ... restliche Callbacks
  },
  // Wichtig für Vercel Production
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};