import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FlowProgress } from '@/lib/onboarding/flow';
import { StepShell, type StepShellProps } from '../step-shell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('@/lib/auth/actions', () => ({ signOut: vi.fn() }));
vi.mock('@/lib/pwa/client-store', () => ({ clearPwaData: vi.fn() }));
vi.mock('@/lib/pwa/push-client', () => ({ unsubscribeFromPush: vi.fn() }));

const stepProgress: FlowProgress = { kind: 'step', position: 3, total: 7 };

function render(over: Partial<StepShellProps> = {}): string {
  return renderToStaticMarkup(
    <StepShell
      screen="services"
      progress={stepProgress}
      backHref="/onboarding/business"
      accountId="acc-1"
      heading="Titulli"
      primary={{
        label: 'Vazhdo',
        onPress: async () => ({ ok: true, next: '/x' }),
      }}
      {...over}
    >
      <input aria-label="Fusha" />
    </StepShell>,
  );
}

describe('StepShell', () => {
  it('exposes the position as a progressbar and in the label', () => {
    const html = render();
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="7"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuetext="Hapi 3 nga 7"');
    expect(html).toContain('Hapi 3 nga 7');
    expect(html.match(/data-filled="true"/g)).toHaveLength(3);
    expect(html.match(/data-filled="false"/g)).toHaveLength(4);
  });

  it('renders Back only when there is somewhere to go back to', () => {
    expect(render()).toContain('aria-label="Mbrapa"');
    expect(render({ backHref: null })).not.toContain('aria-label="Mbrapa"');
  });

  it('omits the main button when primary is null and still shows the skip link', () => {
    const html = render({
      primary: null,
      skip: {
        label: 'Më vonë',
        onPress: async () => ({ ok: true, next: '/x' }),
      },
    });
    expect(html).not.toContain('type="submit"');
    expect(html).toContain('Më vonë');
  });

  it('shows the default helper line and honours an override', () => {
    expect(render()).toContain('Progresi ruhet automatikisht');
    expect(render({ helper: 'Tjetër' })).toContain('Tjetër');
  });

  it('gives sign out an accessible name that says progress is saved', () => {
    expect(render()).toContain('aria-label="Dil. Progresi yt është ruajtur."');
  });

  it('shows Përfunduar with every segment filled on the finish screen', () => {
    const html = render({
      screen: 'finish',
      progress: { kind: 'complete', total: 7 },
      backHref: null,
    });
    expect(html).toContain('Përfunduar');
    expect(html.match(/data-filled="true"/g)).toHaveLength(7);
    expect(html).not.toContain('data-filled="false"');
  });

  it('never disables the main button', () => {
    const html = render();
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(button).not.toBe('');
    // Class names contain "disabled:" variants; only the attribute matters.
    expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it('renders the heading as the focus target', () => {
    expect(render()).toMatch(/<h1[^>]*tabindex="-1"[^>]*>Titulli<\/h1>/);
  });

  it('renders leading before the heading and omits it by default', () => {
    const html = render({ leading: <span data-testid="lead" /> });
    expect(html.indexOf('data-testid="lead"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="lead"')).toBeLessThan(
      html.indexOf('<h1'),
    );
    expect(render()).not.toContain('data-testid="lead"');
  });

  it('centres with auto margins, not justify-center', () => {
    const html = render({ align: 'center' });
    expect(html).toContain('[&amp;&gt;:first-child]:mt-auto');
    expect(html).toContain('[&amp;&gt;:last-child]:mb-auto');
    const main = html.match(/<main[^>]*>/)?.[0] ?? '';
    expect(main).not.toContain('justify-center');
    expect(render().match(/<main[^>]*>/)?.[0]).not.toContain('mt-auto');
  });

  it('passes field errors and pending state to a render-prop child', () => {
    const html = renderToStaticMarkup(
      <StepShell
        screen="business"
        progress={stepProgress}
        backHref={null}
        accountId="acc-1"
        heading="H"
      >
        {({ fieldErrors, pending }) => (
          <span>{`${Object.keys(fieldErrors).length}-${pending}`}</span>
        )}
      </StepShell>,
    );
    expect(html).toContain('0-false');
  });
});
