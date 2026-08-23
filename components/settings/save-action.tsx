import { t } from '@/lib/i18n';

/** NavBar right-slot save text button; pass `form` to submit a named form. */
export function SaveAction({
  onClick,
  disabled,
  form,
}: {
  onClick?: () => void;
  disabled?: boolean;
  form?: string;
}) {
  return (
    <button
      type={form ? 'submit' : 'button'}
      form={form}
      disabled={disabled}
      onClick={onClick}
      className="-mr-2 flex min-h-11 items-center px-2 text-[15.5px] font-bold tracking-[-0.01em] text-primary disabled:cursor-default disabled:opacity-40"
    >
      {t.actions.save}
    </button>
  );
}
