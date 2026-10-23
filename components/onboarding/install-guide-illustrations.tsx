import { Share, SquarePlus } from 'lucide-react';
import type { CSSProperties } from 'react';

// Drawn in code after the canvas (S7b): one 88x88 composition per guide card.
// Each sits inside GuideCards' aria-hidden tile, so none carries a label.

const abs = (style: CSSProperties): CSSProperties => ({
  position: 'absolute',
  ...style,
});

const TILE: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  background: 'var(--neutral-200)',
};

/** Card 1: the Safari toolbar with the Share button highlighted. */
export function ShareIllustration() {
  return (
    <span
      style={abs({
        left: 10,
        top: 50,
        width: 68,
        height: 26,
        boxSizing: 'border-box',
        borderRadius: 9,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 6px',
      })}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: 'var(--neutral-300)',
        }}
      />
      <span
        style={{
          width: 22,
          height: 22,
          boxSizing: 'border-box',
          borderRadius: 9999,
          background: 'var(--brand-50)',
          border: '1.5px solid var(--primary)',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Share size={12} strokeWidth={2.4} />
      </span>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: 'var(--neutral-300)',
        }}
      />
    </span>
  );
}

/** Card 2: the share sheet list with "Add to Home Screen" highlighted. */
export function AddToHomeIllustration() {
  return (
    <>
      <span
        style={abs({
          left: 12,
          top: 32,
          width: 64,
          height: 14,
          borderRadius: 4,
          background: 'var(--card)',
        })}
      />
      <span
        style={abs({
          left: 12,
          top: 50,
          width: 64,
          height: 16,
          boxSizing: 'border-box',
          borderRadius: 4,
          background: 'var(--brand-50)',
          border: '1.5px solid var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 4,
          color: 'var(--primary)',
        })}
      >
        <SquarePlus size={10} strokeWidth={2.6} />
      </span>
      <span
        style={abs({
          left: 12,
          top: 70,
          width: 64,
          height: 14,
          borderRadius: 4,
          background: 'var(--card)',
        })}
      />
    </>
  );
}

/** Card 3: a home screen with the Medium tile in place. */
export function HomeScreenIllustration() {
  return (
    <>
      <span style={abs({ ...TILE, left: 34, top: 22 })} />
      <span style={abs({ ...TILE, left: 58, top: 22 })} />
      <span style={abs({ ...TILE, left: 34, top: 46 })} />
      <span
        style={abs({
          left: 56,
          top: 44,
          width: 22,
          height: 22,
          boxSizing: 'border-box',
          borderRadius: 7,
          background: 'var(--card)',
          border: '2px solid var(--primary)',
        })}
      />
      <span style={abs({ ...TILE, left: 10, top: 46 })} />
      <span
        style={abs({
          left: 10,
          top: 70,
          width: 18,
          height: 6,
          borderRadius: 3,
          background: 'var(--neutral-200)',
        })}
      />
      <span
        style={abs({
          left: 56,
          top: 70,
          width: 22,
          height: 6,
          borderRadius: 3,
          background: 'var(--primary)',
        })}
      />
    </>
  );
}
