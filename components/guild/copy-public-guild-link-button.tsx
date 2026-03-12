'use client';

import { useState } from 'react';

type CopyPublicGuildLinkButtonProps = {
  publicUrl: string;
};

type CopyNotice = {
  tone: 'success' | 'error';
  message: string;
};

export function CopyPublicGuildLinkButton({
  publicUrl,
}: CopyPublicGuildLinkButtonProps) {
  const [notice, setNotice] = useState<CopyNotice | null>(null);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setNotice({
        tone: 'error',
        message: 'Clipboard API unavailable',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setNotice({
        tone: 'success',
        message: 'Copied public link',
      });
    } catch {
      setNotice({
        tone: 'error',
        message: 'Public link could not be copied',
      });
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
      >
        Copy public guild link
      </button>
      {notice && (
        <p
          className={`mt-2 text-sm ${
            notice.tone === 'success' ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
