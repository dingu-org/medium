import { ArrowDown, Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';

// Drawn in code after the canvas (S6d): one 88x88 composition per guide card.
// Each sits inside GuideCards' aria-hidden tile, so none carries a label.

const abs = (style: CSSProperties): CSSProperties => ({
  position: 'absolute',
  ...style,
});

/** Card 1: a phone and a SIM card. */
export function PhoneSimIllustration() {
  return (
    <>
      <span
        style={abs({
          left: 24,
          top: 16,
          width: 36,
          height: 60,
          boxSizing: 'border-box',
          border: '2px solid var(--neutral-500)',
          borderRadius: 9,
          background: 'var(--card)',
        })}
      />
      <span
        style={abs({
          left: 36,
          top: 22,
          width: 12,
          height: 2,
          borderRadius: 2,
          background: 'var(--neutral-300)',
        })}
      />
      <span
        style={abs({
          left: 50,
          top: 44,
          width: 24,
          height: 30,
          boxSizing: 'border-box',
          borderRadius: '4px 10px 4px 4px',
          background: 'var(--brand-100)',
          border: '1.5px solid var(--brand-400)',
        })}
      />
      <span
        style={abs({
          left: 56,
          top: 54,
          width: 12,
          height: 10,
          borderRadius: 2,
          background: 'var(--brand-300)',
        })}
      />
    </>
  );
}

const APP_TILE: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  background: 'var(--neutral-200)',
};

/** Card 2: an app grid with the WhatsApp Business tile being added. */
export function BusinessAppIllustration() {
  return (
    <>
      <span style={abs({ ...APP_TILE, left: 30, top: 24 })} />
      <span style={abs({ ...APP_TILE, left: 56, top: 24 })} />
      <span style={abs({ ...APP_TILE, left: 30, top: 50 })} />
      <span
        style={abs({
          ...APP_TILE,
          left: 56,
          top: 50,
          boxSizing: 'border-box',
          background: 'var(--card)',
          border: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <WhatsAppMark size={14} />
      </span>
      <span
        style={abs({
          left: 68,
          top: 64,
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: 'var(--primary)',
          color: 'var(--neutral-0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <ArrowDown size={11} strokeWidth={3} />
      </span>
    </>
  );
}

/** Card 3: WhatsApp linked to Medium (dashed link, then a check). */
export function ConnectIllustration() {
  return (
    <>
      <span
        style={abs({
          left: 12,
          top: 38,
          width: 30,
          height: 30,
          boxSizing: 'border-box',
          borderRadius: 9999,
          background: 'var(--card)',
          border: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <WhatsAppMark size={16} />
      </span>
      <span
        style={abs({
          left: 44,
          top: 52,
          width: 8,
          height: 0,
          borderTop: '2px dashed var(--neutral-400)',
        })}
      />
      <span
        style={abs({
          left: 54,
          top: 38,
          width: 30,
          height: 30,
          borderRadius: 9999,
          background: 'var(--success-50)',
          color: 'var(--success-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Check size={16} strokeWidth={2.5} />
      </span>
    </>
  );
}
