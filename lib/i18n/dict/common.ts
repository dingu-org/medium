/** `12 takime` style count helper. */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** Shared chrome: nav, generic actions, mono-caps ops, states, sync, notifications. */
export const common = {
  appName: 'Medium',

  nav: {
    today: 'Sot',
    calendar: 'Kalendari',
    chats: 'Bisedat',
    clients: 'Klientët',
    you: 'Ti',
  },

  actions: {
    save: 'Ruaj',
    saving: 'Po ruhet…',
    cancel: 'Anulo',
    add: 'Shto',
    delete: 'Fshi',
    edit: 'Ndrysho',
    confirm: 'Konfirmo',
    back: 'Mbrapa',
    close: 'Mbyll',
    remove: 'Hiq',
    done: 'U krye',
    continue: 'Vazhdo',
    finish: 'Përfundo',
    start: 'Fillo',
    tryAgain: 'Provo sërish',
    refresh: 'Rifresko',
    install: 'Instalo',
    notNow: 'Jo tani',
    keep: 'Mbaje',
  },

  // Mono-caps quick/reminder actions, per the design.
  ops: {
    confirm: 'KONFIRMO',
    cancel: 'ANULO',
    reschedule: 'RICAKTO',
    help: 'NDIHMË',
  },

  states: {
    loading: 'Po ngarkohet…',
    errorTitle: "S'lidhet dot me serverin",
    errorDescription: 'Kontrollo lidhjen e internetit dhe provo sërish.',
  },

  sync: {
    online: 'Online',
    offline: 'Jashtë linje',
  },

  notifications: {
    title: 'Njoftimet',
    markAllRead: 'Shëno të gjitha si të lexuara',
    empty: 'Asnjë njoftim ende.',
    emptyDescription: 'Rezervimet, anulimet dhe njoftimet do të shfaqen këtu.',
    unread: (n: number) => `Njoftimet, ${n} të palexuara`,
    recentActivity: 'Aktiviteti i fundit në praktikën tënde',
  },

  account: {
    signOut: 'Dilni',
  },
} as const;
