import test from 'node:test';
import assert from 'node:assert/strict';
import { currentServiceFeePeriod } from '../services/monthlyServiceFees.js';

test('service-fee periods follow Asia/Jakarta calendar months', () => {
  assert.equal(currentServiceFeePeriod(new Date('2026-10-31T16:59:59.000Z')), '2026-10-01');
  assert.equal(currentServiceFeePeriod(new Date('2026-10-31T17:00:00.000Z')), '2026-11-01');
  assert.equal(currentServiceFeePeriod(new Date('2026-12-31T17:00:00.000Z')), '2027-01-01');
});
