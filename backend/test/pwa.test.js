import test from 'node:test';
import assert from 'node:assert/strict';
import { createPwaManifest } from '../Controllers/settingsController.js';

test('PWA manifest uses the configured app name and institution logo', () => {
  const manifest = createPwaManifest({
    app_name: 'Al-Hikmah Pay',
    name: 'Pondok Al-Hikmah',
    logo_path: '/api/uploads/pondok-logo.png',
  });

  assert.equal(manifest.name, 'Al-Hikmah Pay');
  assert.equal(manifest.short_name, 'Al-Hikmah Pa');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons[0], {
    src: '/api/uploads/pondok-logo.png',
    sizes: 'any',
    type: 'image/png',
    purpose: 'any',
  });
  assert.equal(manifest.start_url, '/');
});

test('PWA manifest falls back to the institution name and default icon', () => {
  const manifest = createPwaManifest({ name: 'Pondok Contoh', logo_path: null });

  assert.equal(manifest.name, 'Pondok Contoh');
  assert.equal(manifest.icons[0].src, '/pwa-icon.svg');
  assert.equal(manifest.icons[0].type, 'image/svg+xml');
  assert.equal(manifest.icons[1].purpose, 'any maskable');
});
