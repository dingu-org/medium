import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideCards } from '../guide-cards';

const html = renderToStaticMarkup(
  <GuideCards
    cards={[
      { title: 'Një', body: 'Trupi një', illustration: <i data-i="a" /> },
      { title: 'Dy', body: <b>Trupi dy</b>, illustration: <i data-i="b" /> },
      { title: 'Tre', body: 'Trupi tre', illustration: <i data-i="c" /> },
    ]}
  />,
);

describe('GuideCards', () => {
  it('renders the cards in order inside one ordered list', () => {
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html.match(/<li/g)).toHaveLength(3);
    const at = (s: string) => html.indexOf(s);
    expect([at('Një'), at('Dy'), at('Tre')]).toEqual(
      [at('Një'), at('Dy'), at('Tre')].sort((a, b) => a - b),
    );
    expect(html).toContain('<b>Trupi dy</b>');
  });

  it('keeps each illustration and its number in an aria-hidden tile', () => {
    const tiles = [
      ...html.matchAll(/<div aria-hidden="true"[^>]*>(.*?)<\/div>/g),
    ];
    expect(tiles).toHaveLength(3);
    tiles.forEach((m, i) => {
      expect(m[1]).toContain(`data-i="${'abc'[i]}"`);
      expect(m[1]).toContain(`>${i + 1}</span>`);
    });
  });
});
