export const routes = {
  home: () => '/',
  login: () => '/login',
  dashboard: () => '/dashboard',
  guildSettings: () => '/settings/guild',
  publicGuildBoard: (slug: string) => `/gilde/${slug}`,
  guildRegistration: (slug: string) => `/gilde/${slug}/registrieren`,
  guildAssignments: (slug: string) => `/gilde/${slug}/meine-zuweisungen`,
  publicMatching: (slug: string) => `/public/guild/${slug}/matching`,
  publicSimulator: (slug: string) => `/public/guild/${slug}/simulator`,
} as const;
