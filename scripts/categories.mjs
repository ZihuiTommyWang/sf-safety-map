// Maps SFPD incident_category / incident_subcategory / incident_description values
// (dataset wg3w-h783) onto the display categories the app shows. Shared by the data
// build and copied into meta.json so the frontend stays in sync automatically.
//
// Philosophy: this is a personal safety map, so a report only earns a place on it if
// someone was hurt or lost something *because that spot is dangerous*. Police paperwork
// (warrants, investigations, stops), non-place-based harm (fraud, harassing calls,
// domestic violence), perception-only reports (suspicious occ), and business-inventory
// crime (shoplifting) are dropped entirely — mapIncident returns null and the build
// skips the row. Road danger is also dropped for now: SFPD logs only ~10% of real
// collisions; use DataSF's dedicated Traffic Crashes dataset for that (v2).

export const DISPLAY_CATEGORIES = [
  { id: 'assault', label: 'Assault' },
  { id: 'homicide', label: 'Homicide' },
  { id: 'robbery', label: 'Robbery' },
  { id: 'sex-offenses', label: 'Sex Offenses' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'drugs', label: 'Drugs' },
  { id: 'street-disorder', label: 'Street Disorder' },
  { id: 'theft', label: 'Theft' },
  { id: 'car-break-in', label: 'Car Break-In & Damage' },
  { id: 'vehicle-theft', label: 'Vehicle Theft' },
  { id: 'burglary', label: 'Burglary' },
  { id: 'vandalism', label: 'Vandalism' },
  { id: 'arson', label: 'Arson' },
]

export const PRESET_GROUPS = {
  walking: {
    label: 'Walking',
    cats: ['assault', 'homicide', 'robbery', 'sex-offenses', 'weapons', 'drugs', 'street-disorder'],
  },
  parking: {
    label: 'Parking',
    cats: ['car-break-in', 'vehicle-theft', 'vandalism'],
  },
  living: {
    label: 'Living',
    cats: ['burglary', 'theft', 'vandalism', 'arson'],
  },
  property: {
    label: 'Property',
    cats: ['theft', 'car-break-in', 'vehicle-theft', 'burglary', 'robbery', 'vandalism', 'arson'],
  },
}

const CATEGORY_MAP = {
  'assault': 'assault',
  'homicide': 'homicide',
  'robbery': 'robbery',
  'sex offense': 'sex-offenses',
  'rape': 'sex-offenses',
  'human trafficking (a), commercial sex acts': 'sex-offenses',
  'human trafficking, commercial sex acts': 'sex-offenses',
  'human trafficking (b), involuntary servitude': 'sex-offenses',
  'weapons offense': 'weapons',
  'weapons offence': 'weapons',
  'weapons carrying etc': 'weapons',
  'drug offense': 'drugs',
  'drug violation': 'drugs',
  'disorderly conduct': 'street-disorder',
  'civil sidewalks': 'street-disorder',
  'larceny theft': 'theft',
  'stolen property': 'theft',
  'motor vehicle theft': 'vehicle-theft',
  'motor vehicle theft?': 'vehicle-theft',
  'burglary': 'burglary',
  'malicious mischief': 'vandalism',
  'vandalism': 'vandalism',
  'arson': 'arson',
}
// Everything not listed above is deliberately dropped: Warrant, Traffic Violation
// Arrest, Traffic Collision, Non-Criminal, Miscellaneous Investigation, Case Closure,
// Courtesy Report, Lost Property, Recovered Vehicle, Vehicle Impounded/Misplaced,
// Fraud, Forgery And Counterfeiting, Embezzlement, Gambling, Liquor Laws,
// Prostitution, Suspicious Occ/Suspicious, Missing Person, Offences Against The
// Family And Children, Fire Report, Suicide, Other / Other Offenses /
// Other Miscellaneous (minus the description rescues below).

/**
 * @param {string|undefined} category  SFPD incident_category
 * @param {string|undefined} subcategory  SFPD incident_subcategory
 * @param {string|undefined} description  SFPD incident_description
 * @returns {string|null} display category id, or null to drop the report
 */
export function mapIncident(category, subcategory, description) {
  const desc = (description || '').toLowerCase()

  // Description rules first — they rescue real street crime that SFPD buries in
  // admin categories, and evict non-place-based harm from mapped ones.
  if (desc.includes('trespassing') || desc.includes('lodging without permission')) {
    return 'street-disorder'
  }
  if (desc.includes('phone calls, harassing')) return null

  const sub = (subcategory || '').toLowerCase()
  if (sub.includes('shoplifting')) return null
  if (sub.includes('larceny - from vehicle') || sub.includes('larceny theft - from vehicle')) {
    return 'car-break-in'
  }
  if (sub === 'theft from vehicle' || sub.includes('larceny - auto parts')) return 'car-break-in'
  if (desc.includes('vandalism to vehicle') || desc.includes('tire slashing')) return 'car-break-in'

  const cat = (category || '').toLowerCase().trim()
  return CATEGORY_MAP[cat] ?? null
}
