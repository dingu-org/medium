import { describe, expect, it } from 'vitest';
import {
  confirmationFactsFromRows,
  type ConfirmationFactsRows,
} from '../confirmation-facts';

const rows: ConfirmationFactsRows = {
  mode: null,
  clientAddress: null,
  address: 'Rr. A 1',
  city: 'Tiranë',
  country: 'AL',
  directions: ' Pas bankës ',
  parking: '',
  entrance: null,
  floor: '2',
};

describe('confirmationFactsFromRows', () => {
  it('maps at_business with trimmed details and AL shown as Shqipëri', () => {
    expect(confirmationFactsFromRows({ ...rows, mode: 'at_business' })).toEqual(
      {
        mode: 'at_business',
        address: 'Rr. A 1',
        city: 'Tiranë',
        country: 'Shqipëri',
        directions: 'Pas bankës',
        parking: null,
        entrance: null,
        floor: '2',
      },
    );
  });

  it('keeps another country as stored', () => {
    expect(
      confirmationFactsFromRows({
        ...rows,
        mode: 'at_business',
        country: 'XK',
      }),
    ).toMatchObject({ country: 'XK' });
  });

  it('maps at_client to the client address only', () => {
    expect(
      confirmationFactsFromRows({
        ...rows,
        mode: 'at_client',
        clientAddress: ' Rr. B 2 ',
      }),
    ).toEqual({ mode: 'at_client', clientAddress: 'Rr. B 2' });
    expect(confirmationFactsFromRows({ ...rows, mode: 'at_client' })).toEqual({
      mode: 'at_client',
      clientAddress: null,
    });
  });

  it('maps online and unknown modes without leaking location data', () => {
    expect(confirmationFactsFromRows({ ...rows, mode: 'online' })).toEqual({
      mode: 'online',
    });
    expect(confirmationFactsFromRows(rows)).toEqual({ mode: null });
  });
});
