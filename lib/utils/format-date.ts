/**
 * Format a date string to German locale with date and time.
 * Returns 'Never' for null/undefined values.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Format a date string to German locale with date only.
 * Returns 'Never' for null/undefined values.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
  }).format(date);
}

/**
 * Format a date string to relative time (e.g., "vor 5 Minuten").
 * Returns 'Never' for null/undefined values.
 */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Gerade eben';
  if (diffMinutes < 60) return `vor ${diffMinutes} Minute${diffMinutes === 1 ? '' : 'n'}`;
  if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours === 1 ? '' : 'n'}`;
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;

  return formatDateTime(value);
}