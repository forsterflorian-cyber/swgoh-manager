export const routes = {
  home: () => '/',
  login: (callbackUrl?: string) =>
    callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login',
  dashboard: () => '/dashboard',
  guildSettings: () => '/settings/guild',
  platoonPlanner: () => '/planning/platoons',
  publicGuild: (slug: string) => `/gilde/${slug}`,
  registration: (slug: string) => `/gilde/${slug}/registrieren`,
  assignments: (slug: string) => `/gilde/${slug}/meine-zuweisungen`,
  matching: (slug: string) => `/public/guild/${slug}/matching`,
  simulator: (slug: string) => `/public/guild/${slug}/simulator`,
  targets: (slug: string) => `/public/guild/${slug}/targets`,
  livePlanner: (instanceId: string, phase = 1) => `/tb/${instanceId}/phase/${phase}`,
};
