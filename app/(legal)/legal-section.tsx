import type { ReactNode } from 'react';
import Link from 'next/link';

/** Shared by the four legal documents (`/privacy`, `/terms` in Albanian and
 * `/en/privacy`, `/en/terms` in English) so the two language versions stay
 * structurally identical and can be diffed section by section. The help pages
 * keep their own colocated copy (`help/policy-section.tsx`). */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl font-medium tracking-normal">
        {title}
      </h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-7 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}

/** Cross-link between the two language versions of the same document. The link
 * text is written in the language it leads to (an English reviewer looks for
 * "English version"), so it carries its own `lang`. */
export function LanguageSwitch({
  href,
  label,
  lang,
}: {
  href: string;
  label: string;
  lang: 'sq' | 'en';
}) {
  return (
    <p className="text-sm">
      <Link
        href={href}
        lang={lang}
        className="text-muted-foreground hover:text-foreground underline underline-offset-4"
      >
        {label}
      </Link>
    </p>
  );
}
