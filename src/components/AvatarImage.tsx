import { useState } from 'react';
import { User } from 'lucide-react';

interface AvatarImageProps {
  src?: string;
  alt: string;
  sizeClass?: string;
}

export function AvatarImage({ src, alt, sizeClass = 'w-9 h-9' }: AvatarImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        aria-label={alt}
        className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shrink-0`}
      >
        <User className="w-4 h-4" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0`}
    />
  );
}
