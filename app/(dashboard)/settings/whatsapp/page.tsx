import { Check, Phone, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { NavBar } from '@/components/dashboard/nav-bar';
import { OfflineNote } from '@/components/settings/offline-note';
import { TemplatePreview } from '@/components/settings/template-preview';
import { WAHero } from '@/components/settings/wa-hero';
import { ChannelChip } from '@/components/ui/channel-chip';
import { SectionLabel } from '@/components/ui/section-label';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ConnectWhatsApp } from '../connect-whatsapp';
import { DisconnectSection } from './disconnect-section';

export const metadata = { title: `${t.settings.whatsappBusiness} · Medium` };

// Explainer bullets in design order: phone / check / sparkle.
const BULLET_ICONS = [Phone, Check, Sparkles];

/**
 * WhatsApp lifecycle state machine. Server statuses: null (no row) → connect
 * explainer, 'revoked' → warning + reconnect, 'active' → hero + template +
 * disconnect. 'pending' is never persisted (persistConnection inserts 'active'
 * directly); the design's pending screen is ConnectWhatsApp's client-side
 * in-flight state.
 */
export default async function WhatsAppSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);
  const status = snapshot.whatsappStatus;
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';
  const envMissing = !appId || !configId;

  let body: ReactNode;
  if (status === 'active') {
    body = (
      <>
        <OfflineNote />
        <WAHero
          displayPhoneNumber={snapshot.whatsappDisplayPhoneNumber}
          phoneNumberId={snapshot.whatsappPhoneNumberId}
        />
        <SectionLabel>{t.settings.whatsappRemindersLabel}</SectionLabel>
        <TemplatePreview status={snapshot.whatsappTemplateStatus} />
        <p className="px-4 pt-2 pb-6 text-[12.5px] leading-[1.5] text-ink-3">
          {t.settings.whatsappTemplateNote}
        </p>
        <DisconnectSection />
      </>
    );
  } else if (status === 'revoked') {
    body = (
      <>
        <OfflineNote />
        <ConnectWhatsApp
          appId={appId}
          configId={configId}
          graphVersion={GRAPH_VERSION}
          variant="reconnect"
          note={t.settings.whatsappReconnectNote}
        >
          <div className="rounded-lg bg-card p-5 text-center shadow-[var(--shadow-card)]">
            <div className="mb-3 flex justify-center">
              <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--danger-50)]">
                <Phone className="h-6 w-6 text-destructive" />
              </span>
            </div>
            <p className="font-heading text-[20px] font-bold tracking-[-0.02em] text-foreground">
              {t.settings.whatsappRevokedTitle}
            </p>
            <p className="mt-2 px-2 text-[13.5px] leading-[1.55] text-ink-2">
              {t.settings.whatsappRevokedBody(
                snapshot.whatsappDisplayPhoneNumber ?? undefined,
              )}
            </p>
            <div className="mt-3 flex justify-center">
              <ChannelChip state="reconnect" />
            </div>
          </div>
        </ConnectWhatsApp>
        {envMissing && (
          <p className="text-ink-3 mt-4 text-xs">
            {t.settings.whatsappEnvNote}
          </p>
        )}
      </>
    );
  } else {
    // null (or defensive unreachable 'pending') → not-connected explainer.
    body = (
      <>
        <OfflineNote />
        <ConnectWhatsApp
          appId={appId}
          configId={configId}
          graphVersion={GRAPH_VERSION}
          variant="connect"
          note={t.settings.whatsappConnectNote}
        >
          <div className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-[var(--shadow-card)]">
            {t.settings.whatsappConnectBullets.map((b, i) => {
              const Icon = BULLET_ICONS[i];
              return (
                <div key={b.title} className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--brand-50)]">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {b.title}
                    </p>
                    <p className="text-ink-2 mt-1 text-[12.5px] leading-[1.45]">
                      {b.sub}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ConnectWhatsApp>
        {envMissing && (
          <p className="text-ink-3 mt-4 text-xs">
            {t.settings.whatsappEnvNote}
          </p>
        )}
      </>
    );
  }

  return (
    <div>
      <NavBar title={t.settings.whatsappBusiness} backHref="/settings" />
      <div className="px-4 pt-2 pb-4">{body}</div>
    </div>
  );
}
