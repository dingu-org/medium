import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NewClientForm } from './new-client-form';

export const metadata = { title: 'Shto klient · Medium' };

export default function NewClientPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Button asChild size="icon-sm" variant="ghost">
          <Link href="/clients" aria-label="Kthehu te klientët">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Shto klient</h1>
      </header>
      <NewClientForm />
    </div>
  );
}
