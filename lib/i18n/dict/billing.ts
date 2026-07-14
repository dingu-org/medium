/**
 * Billing & plans copy (Phase 16 C6). Practitioner-facing, informal "ti".
 * Never punitive — caps are presented as plan capacity, not errors — and never
 * shows model names or cost-of-goods. Prices are VAT-inclusive ALL, formatted
 * by the caller (formatLek) and passed in, so no currency math lives here.
 *
 * Push/bell notification strings stay inline in push-payload.ts / format.ts
 * (they are not screen copy); this dictionary covers the billing SURFACES.
 */
export const billing = {
  // Screen chrome
  title: 'Plani & pagesat',
  navTitle: 'Plani & pagesat',
  hubRow: 'Plani & pagesat',

  // Plan names
  planFree: 'Falas',
  planSolo: 'Solo',
  planLifetime: 'I përjetshëm',
  comingSoon: 'Së shpejti',

  // Lifecycle state (current-plan card)
  stateActive: 'Plani yt është aktiv',
  stateLifetime: 'Plan i përjetshëm',
  stateFree: 'Je te plani Falas',
  stateExpiring: (days: number) =>
    days <= 0
      ? 'Plani skadon sot'
      : `Plani skadon pas ${days} ditësh`,
  stateGrace: (days: number) =>
    `Plani skadoi — ${days} ditë për ta rinovuar`,
  renewsOn: (date: string) => `Rinovohet më ${date}`,
  expiresOn: (date: string) => `Skadon më ${date}`,

  // Usage meters
  usageTitle: 'Përdorimi këtë muaj',
  meterConversations: 'Biseda',
  meterReminders: 'Kujtesa',
  meterValue: (used: number, limit: number) => `${used} nga ${limit}`,
  meterWarn: 'Po i afrohesh kufirit mujor',

  // Upgrade offer (Free / expiring)
  upgradeTitle: 'Kalo te Solo',
  upgradeSub: 'Më shumë biseda, kujtesa dhe personalizim.',
  upgradeCta: 'Kalo te Solo',

  // Period picker + price
  periodMonthly: 'Mujor',
  periodYearly: 'Vjetor',
  twoMonthsFree: '2 muaj falas',
  priceMonthly: (all: string) => `${all} ALL / muaj`,
  priceYearly: (all: string) => `${all} ALL / vit`,
  vatNote: 'Çmimet përfshijnë TVSH-në.',

  // Checkout flow
  payCta: 'Vazhdo te pagesa',
  paymentsComingSoonTitle: 'Pagesat vijnë së shpejti',
  paymentsComingSoonBody:
    'Po e përfundojmë lidhjen me sistemin e pagesave. Së shpejti do të mund të kalosh te Solo direkt këtu.',
  checkoutApplied: 'Pagesa u krye. Plani Solo u aktivizua.',
  checkoutPending: 'Pagesa po procesohet. Do ta përditësojmë planin sapo të konfirmohet.',
  checkoutFailed: 'Pagesa nuk u krye. Provo sërish.',

  // Receipts
  receiptsTitle: 'Historiku i pagesave',
  receiptsEmpty: 'Ende s’ke pagesa.',
  receiptPaid: 'Paguar',
  receiptPending: 'Në pritje',
  receiptFailed: 'Dështoi',
  receiptCreated: 'Nisur',

  // Feature bullets (numbers come from plans.ts — passed in)
  featConversations: (n: number) => `${n} biseda / muaj`,
  featReminders: (n: number) => `${n} kujtesa / muaj`,
  featOneService: '1 shërbim aktiv',
  featUnlimitedServices: 'Shërbime të pakufizuara',
  featCustomAssistant: 'Personalizim i asistentit',
  featLongRetention: 'Ruajtje deri në 1 vit',
  featEverything: 'Gjithçka e përfshirë',

  // Upgrade gates on existing screens
  gateServices:
    'Plani Falas lejon 1 shërbim aktiv. Kalo te Solo për shërbime të pakufizuara.',
  gateIdentity: 'Personalizimi i asistentit është vetëm te plani Solo.',
  gateRetention: 'Ruajtja më e gjatë e bisedave është vetëm te plani Solo.',
  gateLockedHint: 'Vetëm te Solo',
  gateCta: 'Kalo te Solo',

  // Onboarding plan step (soft, skippable — never a paywall)
  onboardingTitle: 'Zgjidh planin',
  onboardingSub:
    'Fillo falas dhe kalo te Solo kur të duash — pa asnjë detyrim tani.',
  onboardingChooseSolo: 'Zgjidh Solo',
  onboardingContinueFree: 'Vazhdo me Falas',

  // Landing pricing section
  landingEyebrow: 'Çmimet',
  landingTitle: 'Fillo falas. Rrit kur je gati.',
  landingSub:
    'Pa kontrata, pa kosto të fshehura. Çmimet përfshijnë TVSH-në.',
  landingStartFree: 'Fillo falas',
  landingSoloTag: 'Më i zgjedhuri',
} as const;
