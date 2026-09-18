// Maps SFPD incident_category / incident_subcategory values (dataset wg3w-h783)
// onto the display categories the app shows. Shared by the data build and
// copied into meta.json so the frontend stays in sync automatically.

export const DISPLAY_CATEGORIES = [
  { id: 'assault', label: 'Assault' },
  { id: 'homicide', label: 'Homicide' },
  { id: 'robbery', label: 'Robbery' },
  { id: 'theft', label: 'Theft' },
  { id: 'car-break-in', label: 'Car Break-In' },
  { id: 'vehicle-theft', label: 'Vehicle Theft' },
  { id: 'burglary', label: 'Burglary' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'drugs', label: 'Drugs' },
  { id: 'disorderly', label: 'Disorderly Conduct' },
  { id: 'vandalism', label: 'Vandalism' },
  { id: 'arson', label: 'Arson' },
  { id: 'sex-offenses', label: 'Sex Offenses' },
  { id: 'fraud', label: 'Fraud' },
  { id: 'family', label: 'Family Offenses' },
  { id: 'missing-person', label: 'Missing Person' },
  { id: 'suspicious', label: 'Suspicious Activity' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'other', label: 'Other' },
]

export const PRESET_GROUPS = {
  walking: {
    label: 'Walking',
    cats: ['assault', 'homicide', 'robbery', 'weapons', 'drugs', 'disorderly', 'sex-offenses', 'suspicious'],
  },
  parking: {
    label: 'Parking',
    cats: ['car-break-in', 'vehicle-theft', 'vandalism'],
  },
  living: {
    label: 'Living',
    cats: ['burglary', 'theft', 'vandalism', 'arson', 'fraud'],
  },
  family: {
    label: 'Family',
    cats: ['family', 'missing-person', 'sex-offenses', 'assault'],
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
  'larceny theft': 'theft',
  'stolen property': 'theft',
  'lost property': 'other',
  'motor vehicle theft': 'vehicle-theft',
  'motor vehicle theft?': 'vehicle-theft',
  'recovered vehicle': 'other',
  'vehicle impounded': 'other',
  'vehicle misplaced': 'other',
  'burglary': 'burglary',
  'weapons offense': 'weapons',
  'weapons offence': 'weapons',
  'weapons carrying etc': 'weapons',
  'drug offense': 'drugs',
  'drug violation': 'drugs',
  'disorderly conduct': 'disorderly',
  'civil sidewalks': 'disorderly',
  'malicious mischief': 'vandalism',
  'vandalism': 'vandalism',
  'arson': 'arson',
  'sex offense': 'sex-offenses',
  'rape': 'sex-offenses',
  'prostitution': 'sex-offenses',
  'human trafficking (a), commercial sex acts': 'sex-offenses',
  'human trafficking, commercial sex acts': 'sex-offenses',
  'human trafficking (b), involuntary servitude': 'sex-offenses',
  'fraud': 'fraud',
  'forgery and counterfeiting': 'fraud',
  'embezzlement': 'fraud',
  'gambling': 'fraud',
  'offences against the family and children': 'family',
  'missing person': 'missing-person',
  'suspicious occ': 'suspicious',
  'suspicious': 'suspicious',
  'traffic violation arrest': 'traffic',
  'traffic collision': 'traffic',
}

/**
 * @param {string|undefined} category  SFPD incident_category
 * @param {string|undefined} subcategory  SFPD incident_subcategory
 * @returns {string} display category id
 */
export function mapIncident(category, subcategory) {
  const sub = (subcategory || '').toLowerCase()
  if (sub.includes('larceny - from vehicle') || sub.includes('larceny theft - from vehicle')) {
    return 'car-break-in'
  }
  const cat = (category || '').toLowerCase().trim()
  return CATEGORY_MAP[cat] || 'other'
}
