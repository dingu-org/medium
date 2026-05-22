import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { ConnectWhatsApp } from './connect-whatsapp';

export const metadata = { title: 'Settings · Medium' };

function ConnectionBadge({ status }: { status: string | null }) {
  if (status === 'active') return <Badge>Connected</Badge>;
  if (status === 'revoked') return <Badge variant="destructive">Action needed</Badge>;
  if (status === 'pending') return <Badge variant="secondary">Pending</Badge>;
  return <Badge variant="outline">Not connected</Badge>;
}

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [connection] = await db
    .select({
      status: whatsappConnections.status,
      phoneNumberId: whatsappConnections.phoneNumberId,
    })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.ptId, user.id))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  const status = connection?.status ?? null;
  const connected = status === 'active';

  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            WhatsApp
            <ConnectionBadge status={status} />
          </CardTitle>
          <CardDescription>
            Connect your WhatsApp Business number so patients can message your practice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'revoked' && (
            <p className="text-destructive text-sm">
              Your WhatsApp connection was revoked. Reconnect to resume messaging.
            </p>
          )}
          {connected && connection?.phoneNumberId && (
            <p className="text-muted-foreground text-sm">
              Connected number ID: <span className="font-mono">{connection.phoneNumberId}</span>
            </p>
          )}
          <ConnectWhatsApp
            appId={appId}
            configId={configId}
            graphVersion={GRAPH_VERSION}
            connected={connected}
          />
          {(!appId || !configId) && (
            <p className="text-muted-foreground text-xs">
              Set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID to enable signup.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Practice &amp; AI settings</CardTitle>
          <CardDescription>Practice details, AI greeting, and availability.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Coming in Phase 7 (PT PWA UI).</p>
        </CardContent>
      </Card>
    </div>
  );
}
