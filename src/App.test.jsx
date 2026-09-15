import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('mobile filters', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const date = futureDate(7);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: {
          total_units: 2,
          total_parks: 1,
          total_available_slots: 1,
          types: ['oTENTik', 'Yurt'],
          locations: {},
        },
        history: [],
        dates: {
          [date]: [
            { ParkName: 'Pukaskwa', ResourceName: 'O1', PageTitle: '', Type: 'oTENTik', status: true },
            { ParkName: 'Pukaskwa', ResourceName: 'Y1', PageTitle: '', Type: 'Yurt', status: false },
          ],
        },
      }),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it('keeps the filter controls collapsed until the mobile trigger is used', async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const toggle = container.querySelector('button[aria-controls="filter-controls"]');
    const controls = container.querySelector('#filter-controls');

    expect(toggle).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(controls.className).toContain('hidden');

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(controls.className).toContain('flex');
    expect(controls.className).not.toContain('hidden');
  });
});
