// Run with: node --test scripts/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapIncident, DISPLAY_CATEGORIES, PRESET_GROUPS, KNOWN_DROPPED } from './categories.mjs'

test('plain category mapping', () => {
  assert.equal(mapIncident('Assault', 'Simple Assault', 'Battery'), 'assault')
  assert.equal(mapIncident('Larceny Theft', 'Larceny Theft - Other', 'Theft, From Person'), 'theft')
  assert.equal(mapIncident('Drug Offense', 'Drug Violation', 'Methamphetamine Offense'), 'drugs')
  assert.equal(mapIncident('Malicious Mischief', 'Vandalism', 'Malicious Mischief, Graffiti, Real or Personal Property'), 'vandalism')
})

test('car break-in comes from subcategory and description, not category', () => {
  assert.equal(mapIncident('Larceny Theft', 'Larceny - From Vehicle', 'Theft, From Locked Vehicle, >$950'), 'car-break-in')
  assert.equal(mapIncident('Larceny Theft', 'Theft From Vehicle', 'Theft, From Unlocked Vehicle'), 'car-break-in')
  assert.equal(mapIncident('Larceny Theft', 'Larceny - Auto Parts', 'Theft, Auto Parts'), 'car-break-in')
  assert.equal(mapIncident('Malicious Mischief', 'Vandalism', 'Malicious Mischief, Vandalism to Vehicle'), 'car-break-in')
  assert.equal(mapIncident('Malicious Mischief', 'Vandalism', 'Malicious Mischief, Tire Slashing'), 'car-break-in')
})

test('street disorder rescued from admin categories by description', () => {
  assert.equal(mapIncident('Other Miscellaneous', 'Other', 'Trespassing'), 'street-disorder')
  assert.equal(mapIncident('Other Miscellaneous', 'Other', 'Lodging Without Permission'), 'street-disorder')
  assert.equal(mapIncident('Disorderly Conduct', 'Disorderly Conduct', 'Committing Public Nuisance'), 'street-disorder')
})

test('non-safety reports are dropped', () => {
  assert.equal(mapIncident('Warrant', 'Warrant Arrest', 'Warrant Arrest, Local SF Warrant'), null)
  assert.equal(mapIncident('Larceny Theft', 'Larceny Theft - Shoplifting', 'Theft, Shoplifting, <$50'), null)
  assert.equal(mapIncident('Fraud', 'Fraud', 'Fraud, Credit Card'), null)
  assert.equal(mapIncident('Malicious Mischief', 'Vandalism', 'Phone Calls, Harassing'), null)
  assert.equal(mapIncident('Lost Property', 'Lost Property', 'Lost Property'), null)
  assert.equal(mapIncident('Nonexistent Future Category', undefined, undefined), null)
})

test('every preset references only real category ids', () => {
  const ids = new Set(DISPLAY_CATEGORIES.map((c) => c.id))
  for (const [key, group] of Object.entries(PRESET_GROUPS)) {
    for (const id of group.cats) assert.ok(ids.has(id), `preset ${key} references unknown id ${id}`)
  }
})

test('mapped and known-dropped raw categories do not overlap', () => {
  // A raw category in KNOWN_DROPPED that also maps would hide a drift failure.
  for (const raw of ['assault', 'larceny theft', 'burglary', 'drug offense']) {
    assert.ok(!KNOWN_DROPPED.has(raw), `${raw} is mapped but also listed as known-dropped`)
  }
})
