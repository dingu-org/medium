import { t } from '@/lib/i18n';

/** Build-time version footer; env comes from next.config.ts `env`. */
export function VersionFoot() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const build = process.env.NEXT_PUBLIC_BUILD_ID;
  return (
    <p className="pt-[22px] pb-1 text-center font-mono text-[11.5px] text-ink-3/70">
      {t.settings.versionLabel(version, build)}
    </p>
  );
}
