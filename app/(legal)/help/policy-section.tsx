import type { ReactNode } from 'react';

/** Colocated copy of the `privacy`/`terms` PolicySection pattern, reused
 * across the 4 help pages (kept in `app/(legal)/help` rather than imported
 * across route files, per the legal pages' own private-helper convention). */
export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-xl font-medium tracking-normal">
        {title}
      </h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-7 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}
