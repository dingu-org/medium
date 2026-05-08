import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Chat · Medium' };

export default function ChatPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>WhatsApp conversations with patients will appear here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming in Phase 7 (PT PWA UI).</p>
      </CardContent>
    </Card>
  );
}
