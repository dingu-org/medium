import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LegalLayout from '../layout';
import PrivacyPage, { metadata as privacyMetadata } from '../privacy/page';
import TermsPage, { metadata as termsMetadata } from '../terms/page';
import EnglishPrivacyPage, {
  metadata as enPrivacyMetadata,
} from '../en/privacy/page';
import EnglishTermsPage, {
  metadata as enTermsMetadata,
} from '../en/terms/page';

vi.mock('next/link', () => ({
  default: ({
    href,
    lang,
    children,
  }: {
    href: string;
    lang?: string;
    children: ReactNode;
  }) => (
    <a href={href} lang={lang}>
      {children}
    </a>
  ),
}));

/** `<h2>` count — the two language versions must keep the same sections in the
 * same order so they can be diffed clause by clause. */
function sectionCount(markup: string): number {
  return markup.match(/<h2/g)?.length ?? 0;
}

/** The document's own language, i.e. the `lang` on the `<article>` — not the
 * one on the cross-link, which is written in the language it leads to. */
function documentLang(markup: string): string | undefined {
  return markup.match(/<article[^>]*lang="([a-z]{2})"/)?.[1];
}

describe('legal chrome', () => {
  it('is Albanian and sets no group-wide language', () => {
    const markup = renderToStaticMarkup(<LegalLayout>{null}</LegalLayout>);

    expect(markup).toContain('Privatësia');
    expect(markup).toContain('Kushtet');
    expect(markup).toContain('Ndihmë');
    expect(markup).toContain('Hyr');
    // The document is `<html lang="sq">`; each page declares its own language
    // on its `<article>`. What the chrome must not do is force a language onto
    // everything nested inside it, so this is scoped to the layout's own
    // container elements instead of to the string `lang=` anywhere in the
    // markup — a cross-language link legitimately carries one.
    expect(markup).not.toMatch(
      /<(?:div|main|header|footer|nav|section)\b[^>]*\blang=/,
    );
  });
});

describe('legal route metadata', () => {
  // Relative alternates only resolve because the root layout sets
  // `metadataBase`; x-default points at the canonical Albanian document so a
  // crawler with no language preference is not sent to the reading copy.
  it.each([
    ['privacy sq', privacyMetadata, '/privacy', '/privacy', '/en/privacy'],
    ['privacy en', enPrivacyMetadata, '/en/privacy', '/privacy', '/en/privacy'],
    ['terms sq', termsMetadata, '/terms', '/terms', '/en/terms'],
    ['terms en', enTermsMetadata, '/en/terms', '/terms', '/en/terms'],
  ] as const)(
    'declares canonical and hreflang for %s',
    (_name, metadata, canonical, sq, en) => {
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.alternates?.languages).toEqual({
        sq,
        en,
        'x-default': sq,
      });
    },
  );
});

describe('privacy policy', () => {
  const sq = renderToStaticMarkup(PrivacyPage());
  const en = renderToStaticMarkup(EnglishPrivacyPage());

  it('serves the canonical Albanian version at /privacy', () => {
    expect(documentLang(sq)).toBe('sq');
    expect(sq).toContain('Politika e privatësisë');
  });

  it('serves the English reading copy at /en/privacy', () => {
    expect(documentLang(en)).toBe('en');
    expect(en).toContain('Privacy policy');
  });

  it('cross-links the two language versions', () => {
    expect(sq).toContain('href="/en/privacy"');
    expect(sq).toContain('English version');
    expect(en).toContain('href="/privacy"');
    expect(en).toContain('Versioni në shqip');
  });

  it('keeps both versions section-for-section identical', () => {
    expect(sectionCount(sq)).toBeGreaterThan(0);
    expect(sectionCount(sq)).toBe(sectionCount(en));
  });
});

describe('terms of service', () => {
  const sq = renderToStaticMarkup(TermsPage());
  const en = renderToStaticMarkup(EnglishTermsPage());

  it('serves the canonical Albanian version at /terms', () => {
    expect(documentLang(sq)).toBe('sq');
    expect(sq).toContain('Kushtet e shërbimit');
  });

  it('serves the English reading copy at /en/terms', () => {
    expect(documentLang(en)).toBe('en');
    expect(en).toContain('Terms of service');
  });

  it('cross-links the two language versions', () => {
    expect(sq).toContain('href="/en/terms"');
    expect(sq).toContain('English version');
    expect(en).toContain('href="/terms"');
    expect(en).toContain('Versioni në shqip');
  });

  it('keeps both versions section-for-section identical', () => {
    expect(sectionCount(sq)).toBeGreaterThan(0);
    expect(sectionCount(sq)).toBe(sectionCount(en));
  });
});
