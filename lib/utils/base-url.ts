export function getAppBaseUrl(): string {
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();

  if (nextAuthUrl) {
    return nextAuthUrl.replace(/\/$/, '');
  }

  // Use custom domain for production, fallback to VERCEL_URL for preview deployments
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (vercelEnv === 'production' && vercelUrl) {
    // For production, use the custom domain
    return 'https://swgoh-manager.vercel.app';
  }

  if (vercelUrl) {
    // For preview deployments, use the preview URL
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

export function buildPublicGuildTargetsUrl(slug: string, baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return new URL(`/public/guild/${encodeURIComponent(slug)}/targets`, normalizedBaseUrl).toString();
}
