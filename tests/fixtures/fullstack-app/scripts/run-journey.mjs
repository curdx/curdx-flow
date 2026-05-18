#!/usr/bin/env node

const scenario = process.argv[2] ?? 'happy';

const outputs = {
  happy: {
    journeyId: 'profile-save',
    page: '/profile',
    api: { method: 'PATCH', path: '/api/profile', status: 200 },
    readback: { method: 'GET', path: '/api/profile', persisted: true },
    ui: { state: 'success-after-submit', name: 'Ada Lovelace' },
  },
  'api-failure': {
    journeyId: 'profile-save',
    page: '/profile',
    api: { method: 'PATCH', path: '/api/profile', status: 500 },
    readback: { skipped: true },
    ui: { state: 'error' },
  },
  'data-failure': {
    journeyId: 'profile-save',
    page: '/profile',
    api: { method: 'PATCH', path: '/api/profile', status: 200 },
    readback: { method: 'GET', path: '/api/profile', persisted: false },
    ui: { state: 'success-after-submit', name: 'Ada Lovelace' },
  },
};

if (!Object.hasOwn(outputs, scenario)) {
  console.error(`Unknown profile-save scenario: ${scenario}`);
  process.exit(2);
}

console.log(JSON.stringify(outputs[scenario], null, 2));
