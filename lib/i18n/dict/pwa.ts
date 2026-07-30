import { plural } from './common';

/** PWA: offline / pending-sync / failed banners, install + update prompts, toasts. */
export const pwa = {
  offlineNoChanges: 'Je jashtë linje. Po shfaqen të dhënat e fundit.',
  offline: (n: number) =>
    `Je jashtë linje. Po shfaqen të dhënat e fundit. ${plural(n, 'ndryshim', 'ndryshime')} do të sinkronizohen kur të lidhesh.`,
  pendingSync: (n: number) =>
    `${plural(n, 'ndryshim', 'ndryshime')} ${n === 1 ? 'pret' : 'presin'} sinkronizimin.`,
  failedTitle: (n: number) =>
    `${plural(n, 'ndryshim', 'ndryshime')} ${n === 1 ? 'kërkon' : 'kërkojnë'} vëmendje.`,

  updateAvailable: 'Version i ri i disponueshëm.',
  refresh: 'Rifresko',

  install: 'Instalo',
  installAndroid: 'Instalo Medium për qasje më të shpejtë dhe njoftime.',
  installIos: 'Instalo nga Safari: prek Ndaj, pastaj Shto në ekran.',

  messageQueued: 'Mesazhi do të dërgohet kur të lidhesh.',
  messageSent: 'Mesazhi u dërgua.',
  changeQueued: 'Ndryshimi do të ruhet kur të lidhesh.',

  // Failed mutations banner
  retry: 'Riprovo',
  remove: 'Hiq',
  moreFailedChanges: (n: number) =>
    `${plural(n, 'ndryshim tjetër', 'ndryshime të tjera')} me dështim janë akoma në pritje.`,
  mutationMessageFailed: 'Mesazhi dështoi të sinkronizohet',
  mutationAppointmentFailed: 'Ndryshimi i takimit dështoi',
  mutationChangeFailed: 'Ndryshimi dështoi të sinkronizohet',

  // Synced / failed toasts from service worker events
  pendingChangeSynced: 'Ndryshim në pritje u sinkronizua.',
  pendingChangeFailed: 'Një ndryshim në pritje kërkon vëmendje.',

  // Install banner dismiss
  dismissInstall: 'Mbyll kërkesën e instalimit',

  // Push permission onboarding banner
  pushPrompt: 'Aktivizo njoftimet për rezervime, anulime dhe kërkesa të reja.',
  pushEnable: 'Aktivizo',
  dismissPush: 'Mbyll kërkesën e njoftimeve',

  // Queue / transport errors surfaced as toasts or in the failed-changes banner
  queueFull:
    'Shumë ndryshime në pritje. Lidhu me internetin para se të shtosh të tjera.',
  storageUnavailable: 'Ky shfletues nuk i ruan dot ndryshimet jashtë linje.',
  networkUnavailable: "S'u lidh dot me serverin.",
  requestFailed: 'Kërkesa dështoi.',
} as const;
