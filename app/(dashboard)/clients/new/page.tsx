import { NavBar } from '@/components/dashboard/nav-bar';
import { NewClientForm } from './new-client-form';

export const metadata = { title: 'Shto klient · Medium' };

export default function NewClientPage() {
  return (
    <div>
      <NavBar backHref="/clients" title="Klient i ri" />
      <div className="px-4 pt-2 pb-4">
        <NewClientForm />
      </div>
    </div>
  );
}
