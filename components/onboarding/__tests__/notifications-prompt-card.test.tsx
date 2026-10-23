import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';
import { NotificationsPromptCard } from '../notifications-prompt-card';

describe('NotificationsPromptCard', () => {
  it('renders the Finish card title and body', () => {
    const html = renderToStaticMarkup(<NotificationsPromptCard />);
    expect(html).toContain(t.onboarding.notifications.finishCardTitle);
    expect(html).toContain(t.onboarding.notifications.finishCardBody);
  });
});
