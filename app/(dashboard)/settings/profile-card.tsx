import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { InitialsAvatar } from '@/components/ui/initials-avatar';

/** Hub header card: avatar + name/subtitle linking to the profile screen. */
export function ProfileCard({
  name,
  subtitle,
  email,
  href,
}: {
  name: string;
  subtitle?: string;
  email: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <InitialsAvatar name={name} fallback={email} size={54} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[17.5px] font-bold tracking-[-0.02em] text-foreground">
          {name}
        </span>
        {subtitle && (
          <span className="mt-1 block truncate text-[13px] text-ink-3">
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-ink-3/70" aria-hidden="true" />
    </Link>
  );
}
