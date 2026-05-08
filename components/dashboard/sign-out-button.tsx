'use client';

import { signOut } from '@/lib/auth/actions';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export function SignOutMenuItem() {
  return (
    <form action={signOut} className="contents">
      <DropdownMenuItem asChild>
        <button type="submit" className="w-full cursor-pointer text-left">
          Sign out
        </button>
      </DropdownMenuItem>
    </form>
  );
}
