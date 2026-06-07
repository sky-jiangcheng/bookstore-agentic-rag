import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../lib/theme';

test('parseThemeMode accepts supported values and defaults invalid values to dark', () => {
  assert.equal(parseThemeMode('light'), 'light');
  assert.equal(parseThemeMode('dark'), 'dark');
  assert.equal(parseThemeMode('system'), 'system');
  assert.equal(parseThemeMode('sepia'), 'dark');
  assert.equal(parseThemeMode(null), 'dark');
});

test('resolveTheme follows the system preference only in system mode', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('theme storage uses a dedicated stable key', () => {
  assert.equal(THEME_STORAGE_KEY, 'bookstore-theme');
});
