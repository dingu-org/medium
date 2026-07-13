import { ChannelChip, type ChannelChipState } from '@/components/ui/channel-chip';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';

/** WhatsApp connected hero (MT WAHero): green mark bubble, prominent display
 *  number, channel chip, mono phone_number_id as a support/debug ref. The
 *  `phone_number_id` literal is shown verbatim per the design — untranslated. */
export function WAHero({
  displayPhoneNumber,
  phoneNumberId,
  state = 'connected',
}: {
  displayPhoneNumber: string | null;
  phoneNumberId: string | null;
  state?: ChannelChipState;
}) {
  return (
    <div className="mb-6 rounded-lg bg-card px-[18px] py-5 text-center shadow-[var(--shadow-card)]">
      <div className="mb-3 flex justify-center">
        <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--success-50)]">
          <WhatsAppMark size={26} />
        </span>
      </div>
      {displayPhoneNumber && (
        <p className="font-heading text-[23px] font-bold tracking-[-0.02em] tabular-nums text-foreground">
          {displayPhoneNumber}
        </p>
      )}
      <div className="mt-[9px] flex justify-center">
        <ChannelChip state={state} />
      </div>
      {phoneNumberId && (
        <p className="mt-3 font-mono text-[11px] text-ink-3/70">
          phone_number_id {phoneNumberId}
        </p>
      )}
    </div>
  );
}
