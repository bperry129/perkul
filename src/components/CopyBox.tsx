'use client';

import { useState } from 'react';

/** Copy-to-clipboard for the generated bank prompt. */
export function CopyBox({ text, label = 'Copy prompt' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="action" onClick={copy}>
          {copied ? 'Copied' : label}
        </button>
        <span className="label">{text.length.toLocaleString()} characters</span>
      </div>
      <label className="field">
        <span className="field__label">Prompt</span>
        <textarea readOnly value={text} rows={18} onFocus={(e) => e.currentTarget.select()} />
      </label>
    </div>
  );
}
