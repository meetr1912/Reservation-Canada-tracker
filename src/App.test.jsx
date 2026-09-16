import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// jsdom has no matchMedia; report a phone-sized viewport so the app mounts its
// mobile chrome (sticky bar + filter sheet).
function mockNarrowViewport() {
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe('mobile filters', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    mockNarrowViewport();
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

  it('keeps the filter sheet closed until the mobile trigger is used', async () => {
    await act(async () => {
      root.render(<I18nProvider initialLang="en"><App /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const toggle = container.querySelector('[data-testid="filters-button"]');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
    expect(document.body.querySelector('[data-testid="filters-sheet"]')).toBeNull();

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const sheet = document.body.querySelector('[data-testid="filters-sheet"]');
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain('Filters');
    expect(sheet.textContent).toContain('Parks');
    expect(sheet.textContent).toMatch(/Show \d+ results?/);

    const close = sheet.querySelector('[aria-label="Close filters"]');
    await act(async () => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.body.querySelector('[data-testid="filters-sheet"]')).toBeNull();
  });
});
