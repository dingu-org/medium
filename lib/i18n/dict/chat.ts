/** Chat list + thread (takeover, escalation, pause, send states, 24h window). */
export const chat = {
  title: 'Bisedat',
  emptyTitle: 'Asnjë bisedë aktive',
  emptyText: 'Kur një pacient shkruan, do ta shohësh këtu.',

  aiHandling: 'Medium po përgjigjet',
  aiHandlingDesc: 'IA po menaxhon këtë',
  youHandling: 'Ti po bisedon',
  youHandlingDesc: 'Ti po bisedon',
  escalated: 'Të duhet ty',
  paused: 'Në pauzë',

  takeOver: 'Merre në dorë',
  handBack: 'Ktheja Medium-it',
  resume: 'Aktivizo tani',

  noticeEscalated:
    'Pacienti kërkoi të flasë me një person. Medium ndaloi përgjigjet.',
  noticeTakeover: "Ti po bisedon — Medium është në pauzë derisa t'ia kthesh.",
  noticePaused: (time: string) =>
    `Ti i shkrove vetë nga WhatsApp. Medium u ndal automatikisht deri në ${time}.`,

  sent: 'dërguar',
  pendingSync: 'Në pritje',
  needsAttention: 'Kërkon vëmendje',
  fromYourPhone: 'nga telefoni yt',
  messagePlaceholder: 'Shkruaj një mesazh…',

  windowClosedTitle: 'Dritarja 24-orëshe u mbyll',
  windowClosedText:
    "Nuk mund t'i shkruash jashtë 24 orëve pa një shabllon të miratuar.",
  revokedTitle: 'WhatsApp u shkëput',
  revokedText: 'Rilidh për të dërguar mesazhe.',
  sendFailed: 'Dërgimi dështoi. Provo sërish.',
  sendMessage: 'Dërgo mesazhin',

  letAiRespond: 'Lëre IA të përgjigjet',
  backToChats: 'Kthehu te bisedat',
  noMessagesYet: 'Ende asnjë mesazh',
  youPrefix: 'Ti: ',

  msgQueued: 'Mesazh u radhit. Do të dërgohet kur të jesh online.',
  msgQueuedRetry: 'Mesazh u radhit. Do të provohet automatikisht.',
  msgQueueError: 'Nuk mund ta radhisësh mesazhin.',

  aiBadge: 'Medium',
  youBadge: 'Ti',
  closedBadge: 'Mbyllur',
} as const;
