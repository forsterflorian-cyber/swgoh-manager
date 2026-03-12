type SessionIndicatorProps = {
  displayName: string;
  guildName?: string | null;
  guildSlug?: string | null;
};

export function SessionIndicator({
  displayName,
  guildName,
  guildSlug,
}: SessionIndicatorProps) {
  const guildLabel = guildSlug?.trim() || guildName?.trim() || null;

  return (
    <div className="text-right">
      <p className="text-sm font-medium text-white">{displayName}</p>
      {guildLabel && <p className="text-xs text-gray-400">{guildLabel}</p>}
    </div>
  );
}
