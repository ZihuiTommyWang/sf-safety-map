import test from 'node:test'
import assert from 'node:assert/strict'
import { mapIncidentNYC } from './categories-nyc.mjs'

test('direct offense mappings', () => {
  assert.equal(mapIncidentNYC('FELONY ASSAULT', 'ASSAULT 2,1,UNCLASSIFIED'), 'assault')
  assert.equal(mapIncidentNYC('ROBBERY', 'ROBBERY,OPEN AREA UNCLASSIFIED'), 'robbery')
  assert.equal(mapIncidentNYC('MURDER & NON-NEGL. MANSLAUGHTER', ''), 'homicide')
  assert.equal(mapIncidentNYC('GRAND LARCENY OF MOTOR VEHICLE', 'LARCENY,GRAND OF AUTO'), 'vehicle-theft')
})

test('larceny splits: shoplifting drops, vehicle subtypes become car break-in', () => {
  assert.equal(mapIncidentNYC('PETIT LARCENY', 'LARCENY,PETIT FROM STORE-SHOPL'), null)
  assert.equal(mapIncidentNYC('GRAND LARCENY', 'LARCENY,GRAND FROM STORE-SHOPL'), null)
  assert.equal(mapIncidentNYC('PETIT LARCENY', 'LARCENY,PETIT FROM AUTO'), 'car-break-in')
  assert.equal(mapIncidentNYC('GRAND LARCENY', 'LARCENY,GRAND FROM VEHICLE/MOTORCYCLE'), 'car-break-in')
  assert.equal(
    mapIncidentNYC('GRAND LARCENY', 'LARCENY,GRAND OF VEHICULAR/MOTORCYCLE ACCESSORIES'),
    'car-break-in',
  )
  assert.equal(mapIncidentNYC('PETIT LARCENY', 'LARCENY,PETIT OF LICENSE PLATE'), 'car-break-in')
  assert.equal(mapIncidentNYC('PETIT LARCENY', 'LARCENY,PETIT FROM BUILDING,UN'), 'theft')
})

test('criminal mischief splits: vehicle damage vs vandalism', () => {
  assert.equal(mapIncidentNYC('CRIMINAL MISCHIEF & RELATED OF', 'MISCHIEF, CRIMINAL 4, OF MOTOR'), 'car-break-in')
  assert.equal(mapIncidentNYC('CRIMINAL MISCHIEF & RELATED OF', 'MISCHIEF, CRIMINAL 3 & 2, OF M'), 'car-break-in')
  assert.equal(mapIncidentNYC('CRIMINAL MISCHIEF & RELATED OF', 'CRIMINAL MISCHIEF,UNCLASSIFIED 4'), 'vandalism')
  assert.equal(mapIncidentNYC('CRIMINAL MISCHIEF & RELATED OF', 'CRIMINAL MISCHIEF 4TH, GRAFFIT'), 'vandalism')
})

test('misc penal law keeps only reckless endangerment', () => {
  assert.equal(mapIncidentNYC('MISCELLANEOUS PENAL LAW', 'RECKLESS ENDANGERMENT 1'), 'assault')
  assert.equal(mapIncidentNYC('MISCELLANEOUS PENAL LAW', 'CRIMINAL CONTEMPT 1'), null)
  assert.equal(mapIncidentNYC('MISCELLANEOUS PENAL LAW', 'BRIBERY,PUBLIC ADMINISTRATION'), null)
})

test('public order: harassment drops, lewdness stays', () => {
  assert.equal(mapIncidentNYC('OFF. AGNST PUB ORD SENSBLTY &', 'AGGRAVATED HARASSMENT 2'), null)
  assert.equal(mapIncidentNYC('OFF. AGNST PUB ORD SENSBLTY &', 'LEWDNESS,PUBLIC'), 'street-disorder')
})

test('interpersonal and paperwork categories drop', () => {
  assert.equal(mapIncidentNYC('HARRASSMENT 2', 'HARASSMENT,SUBD 3,4,5'), null)
  assert.equal(mapIncidentNYC('VEHICLE AND TRAFFIC LAWS', ''), null)
  assert.equal(mapIncidentNYC('FRAUDS', 'FRAUD,UNCLASSIFIED-FELONY'), null)
  assert.equal(mapIncidentNYC('OTHER OFFENSES RELATED TO THEFT', 'THEFT OF SERVICES, UNCLASSIFIE'), null)
})
