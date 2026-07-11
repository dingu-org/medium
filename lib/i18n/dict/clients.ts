/** Client-detail danger zone (erase) + per-client data export. */
export const clients = {
  dangerZone: 'Zona e rrezikut',
  erase: 'Fshi klientin',
  eraseTitle: 'Fshi klientin?',
  eraseBody:
    "Kjo fshin të gjitha mesazhet, takimet dhe të dhënat e klientit. S'kthehet.",
  eraseTypePrompt: (name: string) => `Shkruaj "${name}" për të konfirmuar`,
  eraseConfirm: 'Fshi klientin',
  erasing: 'Po fshihet…',
  eraseFailed: 'Nuk u fshi. Provo sërish.',
  erasedToast: 'Klienti u fshi.',

  exportClient: 'Eksporto të dhënat e klientit',
  exportSub: 'Mesazhe, takime, biseda · JSON',
  exporting: 'Po eksportohet…',
  exportFailed: 'Eksporti dështoi. Provo sërish.',
} as const;
