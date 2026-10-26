import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeCanteenCsvCell,
  isValidCanteenReportDate,
} from '../Controllers/canteenOperationsController.js';

test('canteen reports accept real ISO calendar dates only', () => {
  assert.equal(isValidCanteenReportDate('2024-02-29'), true);
  assert.equal(isValidCanteenReportDate('2025-02-29'), false);
  assert.equal(isValidCanteenReportDate('2026-13-01'), false);
  assert.equal(isValidCanteenReportDate('not-a-date'), false);
  assert.equal(isValidCanteenReportDate(null), false);
});

test('canteen CSV escapes quotes and neutralizes spreadsheet formulas in text', () => {
  assert.equal(escapeCanteenCsvCell('Santri "A"'), '"Santri ""A"""');
  assert.equal(escapeCanteenCsvCell('=HYPERLINK("x")', true), `"\'=HYPERLINK(""x"")"`);
  assert.equal(escapeCanteenCsvCell('-100.00'), '"-100.00"');
});
