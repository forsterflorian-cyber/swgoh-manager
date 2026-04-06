'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  guildId: string;
  memberId: string;
  memberName?: string;
  isIgnored?: boolean;
  initiallyIgnored?: boolean;
};

export function IgnoreMemberButton({ guildId, memberId, memberName = 'this member', isIgnored, initiallyIgnored }: Props) {
  const [loading, setLoading] = useState(false);
  const [ignored, setIgnored] = useState(Boolean(initiallyIgnored ?? isIgnored));

  async function handleToggle() {
    if (loading) return;

    const confirmed = window.confirm(
      ignored
        ? `Are you sure you want to reactivate ${memberName} in planning?`
        : `Are you sure you want to ignore ${memberName} from planning? They will be excluded from matching and simulator.`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/guild/${guildId}/members/${memberId}/ignore`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to update member status');
      }

      const data = await response.json();
      setIgnored(data.action === 'ignored');
    } catch (error) {
      console.error('Toggle ignore error:', error);
      alert('Failed to update member status. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={ignored ? 'secondary' : 'danger'}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? 'Updating...' : ignored ? 'Reactivate' : 'Ignore'}
    </Button>
  );
}