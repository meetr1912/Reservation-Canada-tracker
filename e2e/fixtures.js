// Small, controlled availability reports for tests that need specific data
// states (staleness, partial corruption, a single park, ...).
function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validSite(i) {
  return {
    ParkName: 'Fixture Park - Loop',
    ResourceName: `O${i}`,
    PageTitle: i % 2 ? '#1 - 10' : '',
    Type: i % 3 === 0 ? 'Yurt' : 'oTENTik',
    status: i % 2 === 0,
  };
}

function buildReport({ generatedAt, invalidRows = 0, sites = 10, days = 3 } = {}) {
  const dates = {};
  for (let d = 0; d < days; d++) {
    const rows = Array.from({ length: sites }, (_, i) => validSite(i + 1));
    for (let b = 0; b < invalidRows; b++) rows.push({ ParkName: 42, status: 'yes' });
    dates[isoDaysFromNow(7 + d)] = rows;
  }
  return {
    metadata: {
      generated_at: generatedAt || new Date().toISOString(),
      start_date: isoDaysFromNow(7),
      end_date: isoDaysFromNow(6 + days),
      days,
      total_units: sites,
      total_parks: 1,
      total_available_slots: sites * days,
      available_days: days,
      available_units: sites,
      parks: ['Fixture Park - Loop'],
      types: ['oTENTik', 'Yurt'],
      locations: {},
      always_available_parks: [],
      errors: [],
    },
    history: [
      { date: isoDaysFromNow(-1), available_slots: sites, available_units: sites, available_days: days },
      { date: isoDaysFromNow(0), available_slots: sites * days, available_units: sites, available_days: days },
    ],
    dates,
  };
}

module.exports = { buildReport, isoDaysFromNow };
