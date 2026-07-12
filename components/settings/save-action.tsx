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
      className="px-1 py-2.5 text-[15.5px] font-bold tracking-[-0.01em] text-primary disabled:cursor-default disabled:opacity-40"
    >
      {t.actions.save}
    </button>
  );
}
