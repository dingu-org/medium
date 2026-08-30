/** Chat list + thread (takeover, escalation, pause, send states, 24h window). */
export const chat = {
  title: 'Bisedat',
  emptyTitle: 'Asnjë bisedë aktive',
  emptyText:
    'Kur një pacient shkruan në WhatsApp, biseda shfaqet këtu — Medium përgjigjet vetë.',
  emptyClosedTitle: 'Asnjë bisedë e mbyllur',
  searchPlaceholder: 'Kërko bisedat…',
  searchLabel: 'Kërko bisedat',
  searchClear: 'Pastro kërkimin',
  searchEmptyTitle: 'Asnjë rezultat',
  searchEmptyText: 'Provo një emër, numër ose mesazh tjetër.',
  listNeedsYou: 'Të duhet ty',
  listManaged: 'Medium po menaxhon',
  listClosed: 'Të mbyllura',
  tabActive: 'Aktive',
  tabClosed: 'Të mbyllura',
  noMessages: 'Ende pa mesazhe',

  aiHandling: 'Medium po përgjigjet',
  aiHandlingDesc: 'IA po menaxhon këtë',
  youHandling: 'Ti po bisedon',
  youHandlingDesc: 'Ti po bisedon',
  escalated: 'Të duhet ty',
  paused: 'Medium në pauzë',

  takeOver: 'Merre në dorë',
  handBack: 'Ktheja Medium-it',
  resume: 'Aktivizo tani',
  letMedium: 'Lër Medium-in',
  callCustomer: 'Telefono pacientin',
  closeConversation: 'Mbyll bisedën',
  reopenConversation: 'Rihap bisedën',

  sysStopped: '— Medium ndaloi · pret ty —',
  sysWindowClosed: '— kanë kaluar mbi 24 orë —',
  noticeOffline:
    'Pa internet. Mesazhi u vendos në radhë dhe do të dërgohet kur të lidhesh.',
  noticeClosed:
    'Kjo bisedë është mbyllur. Mesazhi i ardhshëm i klientit do ta rihapë.',
  noticeFailed: 'Një mesazh nuk u dërgua. Provo sërish më poshtë.',
  noticeNotConnected: 'WhatsApp nuk është i lidhur.',
  connectNow: 'Lidhe tani',

  noticeCapReached:
    'Ke arritur kufirin e bisedave për këtë muaj. Bisedat e reja i menaxhon ti derisa të rinovohet muaji.',
  noticeEscalated:
    'Pacienti kërkoi të flasë me një person. Medium ndaloi përgjigjet.',
  noticeTakeover: "Ti po bisedon — Medium është në pauzë derisa t'ia kthesh.",
  noticePaused: (time: string) =>
    `Ti i shkrove vetë nga WhatsApp. Medium u ndal automatikisht deri në ${time}.`,

  sent: 'dërguar',
  pendingSync: 'Në pritje',
  needsAttention: 'Kërkon vëmendje',
  deliverySent: 'Dërguar',
  deliveryDelivered: 'Dorëzuar',
  deliveryRead: 'Lexuar',
  deliveryFailed: 'Nuk u dërgua',
  fromYourPhone: 'nga telefoni yt',
  messagePlaceholder: 'Shkruaj një mesazh…',

  windowClosedTitle: 'Dritarja 24-orëshe u mbyll',
  // The whole windowClosed composer state (components/chat/composer.tsx) — the
  // template button next to it is gated off with reminders, so nothing at all
  // can be sent until the customer writes. Say that, and no more.
  windowClosedText:
    "Dritarja 24-orëshe u mbyll. Klienti duhet të shkruajë sërish para se t'i përgjigjesh.",
  sendTemplateReminder: 'Dërgo kujtesë me shabllon',
  revokedTitle: 'WhatsApp u shkëput',
  revokedText: 'WhatsApp u shkëput. Rilidh për të dërguar mesazhe.',
  reconnectWhatsApp: 'Rilidh WhatsApp',
  sendFailed: 'Dërgimi dështoi. Provo sërish.',
  sendMessage: 'Dërgo mesazhin',
  retry: 'Provo sërish',
  reminderSent: 'Kujtesa u dërgua.',
  reminderFailed: 'Kujtesa nuk u dërgua.',

  letAiRespond: 'Lëre IA të përgjigjet',
  backToChats: 'Kthehu te bisedat',
  noMessagesYet: 'Ende asnjë mesazh',
  youPrefix: 'Ti: ',
  aiPrefix: 'Medium: ',

  msgQueued: 'Mesazh u radhit. Do të dërgohet kur të jesh online.',
  msgQueuedRetry: 'Mesazh u radhit. Do të provohet automatikisht.',
  msgQueueError: 'Nuk mund ta radhisësh mesazhin.',

  aiBadge: 'Medium',
  youBadge: 'Ti',
  closedBadge: 'Mbyllur',
  pausedBadge: 'Në pauzë',

  loadMore: 'Shfaq më shumë',
  loadingMore: 'Po ngarkohet…',
  loadOlder: 'Shfaq mesazhet e mëparshme',
  loadingOlder: 'Po ngarkohen…',
} as const;
