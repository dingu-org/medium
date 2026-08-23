'use client';

import { type FormEvent, useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { NavBar } from '@/components/dashboard/nav-bar';
import { OfflineNote } from '@/components/settings/offline-note';
import { SaveAction } from '@/components/settings/save-action';
import { SetField } from '@/components/settings/set-field';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import type { SettingsState } from '../constants';
import { updateProfile } from './actions';

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};
const FORM_ID = 'profile-form';

export function ProfileForm({
  fullName,
  title,
  name,
  address,
  phone,
  email,
}: {
  fullName: string;
  title: string;
  name: string;
  address: string;
  phone: string | null;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initialState);
  const online = useOnlineStatus();

  useEffect(() => {
    if (state.success) toast.success(t.settings.savedToast);
    if (state.error) toast.error(state.error);
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (online) return; // offline defense (SaveAction is already disabled)
    event.preventDefault();
    toast.error(t.settings.settingsRequireConnection);
  }

  const avatarName = fullName || name || email;

  return (
    <>
      <NavBar
        title={t.settings.profileBusiness}
        backHref="/settings"
        right={<SaveAction form={FORM_ID} disabled={pending || !online} />}
      />
      <div className="space-y-6 px-4 pt-2 pb-4">
        <OfflineNote />
        <div className="flex justify-center pt-1">
          <InitialsAvatar name={avatarName} fallback={email} size={76} />
        </div>
        <form
          id={FORM_ID}
          action={action}
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <SetField
            label={t.settings.fullName}
            name="fullName"
            defaultValue={fullName}
            disabled={!online}
            error={state.fieldErrors?.fullName?.[0]}
          />
          <SetField
            label={t.settings.profileTitleLabel}
            name="title"
            defaultValue={title}
            help={t.settings.profileTitleHelp}
            disabled={!online}
            error={state.fieldErrors?.title?.[0]}
          />
          <SetField
            label={t.settings.profilePracticeLabel}
            name="name"
            defaultValue={name}
            disabled={!online}
            error={state.fieldErrors?.name?.[0]}
          />
          <SetField
            label={t.settings.profileAddressLabel}
            name="address"
            defaultValue={address}
            help={t.settings.profileAddressHelp}
            disabled={!online}
            error={state.fieldErrors?.address?.[0]}
          />
          <SetField
            label={t.settings.profilePhoneLabel}
            defaultValue={phone ?? undefined}
            placeholder={t.settings.connectionBadgeNotConnected}
            help={t.settings.profilePhoneHelp}
            readOnly
          />
        </form>
      </div>
    </>
  );
}
