// Maps NYPD complaint ofns_desc / pd_desc values (datasets qgea-i56i historic
// + 5uac-w243 year-to-date) onto the same 13 display categories as SF.
//
// Same philosophy as SF (see categories.mjs): place-based harm only. The big
// NYC-specific cuts are Harassment 2 (NYC's largest category — interpersonal
// texts/calls/disputes, not street danger), Criminal Contempt (protective-order
// violations, i.e. domestic situations), Theft of Services (fare evasion,
// dine-and-dash), and shoplifting.

import { DISPLAY_CATEGORIES } from './categories.mjs'

export { DISPLAY_CATEGORIES }

// ofns_desc values mapped 1:1 to a display category.
const DIRECT = new Map(
  Object.entries({
    'felony assault': 'assault',
    'assault 3 & related offenses': 'assault',
    'kidnapping & related offenses': 'assault',
    'offenses against the person': 'assault', // mostly reckless endangerment 2
    'murder & non-negl. manslaughter': 'homicide',
    'homicide-negligent,unclassifie': 'homicide',
    'homicide-negligent-vehicle': 'homicide',
    robbery: 'robbery',
    'sex crimes': 'sex-offenses',
    rape: 'sex-offenses',
    'dangerous weapons': 'weapons',
    'unlawful poss. weap. on school': 'weapons',
    'dangerous drugs': 'drugs',
    'cannabis related offenses': 'drugs',
    'grand larceny of motor vehicle': 'vehicle-theft',
    'petit larceny of motor vehicle': 'vehicle-theft',
    'unauthorized use of a vehicle': 'vehicle-theft',
    burglary: 'burglary',
    "burglar's tools": 'burglary',
    arson: 'arson',
    'criminal trespass': 'street-disorder',
    'disorderly conduct': 'street-disorder',
    jostling: 'street-disorder', // pickpocketing setups
    'fraudulent accosting': 'street-disorder', // street scams (shell games etc.)
    'prostitution & related offenses': 'street-disorder',
  }),
)

// Raw categories we deliberately drop entirely (lowercased ofns_desc).
export const KNOWN_DROPPED = new Set([
  'harrassment 2', // sic — NYPD's spelling
  'vehicle and traffic laws',
  'intoxicated & impaired driving',
  'intoxicated/impaired driving',
  'other traffic infraction',
  'frauds',
  'theft-fraud',
  'forgery',
  'offenses involving fraud',
  'other offenses related to theft', // theft of services: fare evasion etc.
  'possession of stolen property',
  'offenses against public administration',
  'offenses against public admini',
  'administrative code',
  'other state laws',
  'other state laws (non penal law)',
  'other state laws (non penal la',
  'offenses against public safety',
  'gambling',
  'loitering/gambling (cards, dic',
  'alcoholic beverage control law',
  'child abandonment/non support 1',
  'offenses related to children',
  'escape 3',
  'anticipatory offenses',
  'new york city health code',
  'fortune telling',
  'disruption of a religious serv',
  'under the influence of drugs',
  '(null)',
])

// Raw categories that ARE handled, but at pd_desc level (so some of their rows
// legitimately drop) — exempt from the drift guard.
export const MAPPED_RAW = new Set([
  'petit larceny',
  'grand larceny',
  'criminal mischief & related of',
  'miscellaneous penal law',
  'off. agnst pub ord sensblty &',
])

/**
 * Returns the display category id for one NYPD complaint, or null to drop it.
 * @param {string|undefined} ofns ofns_desc
 * @param {string|undefined} pd pd_desc
 */
export function mapIncidentNYC(ofns, pd) {
  const o = (ofns || '').toLowerCase().trim()
  const p = (pd || '').toUpperCase()

  const direct = DIRECT.get(o)
  if (direct) return direct

  if (o === 'petit larceny' || o === 'grand larceny') {
    if (p.includes('SHOPL')) return null // shoplifting: business inventory loss
    if (
      p.includes('FROM AUTO') ||
      p.includes('FROM VEHICLE') ||
      p.includes('VEHICLE ACCES') ||
      p.includes('VEHICULAR') ||
      p.includes('LICENSE PLATE')
    )
      return 'car-break-in'
    return 'theft'
  }

  if (o === 'criminal mischief & related of') {
    // "MISCHIEF, CRIMINAL 4, OF MOTOR" / "MISCHIEF, CRIMINAL 3 & 2, OF M"
    if (p.includes('OF MOTOR') || /,\s*OF M\s*$/.test(p)) return 'car-break-in'
    return 'vandalism'
  }

  if (o === 'miscellaneous penal law') {
    // Keep the genuinely dangerous slice; criminal contempt / bribery etc. drop.
    if (p.includes('RECKLESS ENDANGERMENT')) return 'assault'
    return null
  }

  if (o === 'off. agnst pub ord sensblty &') {
    if (p.includes('HARASSMENT')) return null // aggravated harassment: calls/texts
    if (p.includes('LEWD') || p.includes('RIOT') || p.includes('NUISANCE')) return 'street-disorder'
    return null
  }

  return null
}
