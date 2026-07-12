import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

/** Design AddDashed: full-width dashed add button below a grouped card. */
export function AddDashed({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-3 flex w-full items-center justify-center gap-[7px] rounded-[18px] border-[1.5px] border-dashed border-[#cdd4de] py-[14px] text-[14px] font-semibold text-primary transition-colors hover:bg-muted/40 disabled:opacity-40"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}
