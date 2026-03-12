export function getAppBaseUrl(): string {
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();

  if (nextAuthUrl) {
    return nextAuthUrl.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}
