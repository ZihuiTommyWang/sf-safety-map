import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// One codebase, one build per city: VITE_CITY=sf (default) or nyc.
// The deploy workflow assembles the final site: each build under /<city>/,
// plus root files from root-site/.
const city = process.env.VITE_CITY || 'sf'

const NYC_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'New York Safety Map',
      url: 'https://citysafetymap.com/nyc/',
      description:
        'A free, open-source New York City crime and safety map. Search any NYC address and see real NYPD incident reports nearby, filterable by crime type and time window.',
      applicationCategory: 'Map',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      creator: { '@type': 'Person', name: 'Tommy Wang' },
    },
    {
      '@type': 'Dataset',
      name: 'New York City Safety Incidents (processed)',
      description:
        "NYPD complaint reports from the last 3 years, filtered to place-based safety incidents and grouped into 13 categories. Derived from NYC Open Data's NYPD Complaint Data, which the NYPD publishes quarterly.",
      url: 'https://citysafetymap.com/nyc/',
      isBasedOn: 'https://data.cityofnewyork.us/d/qgea-i56i',
      license: 'https://opendatacommons.org/licenses/pddl/1-0/',
      spatialCoverage: 'New York City, New York',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Where does the New York Safety Map get its data?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Real NYPD incident reports via NYC Open Data, the city's open data portal. The NYPD publishes this data quarterly.",
          },
        },
        {
          '@type': 'Question',
          name: 'What crimes are shown on the map?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Crimes are grouped into 13 categories, like assault, robbery, theft, car break-ins, vehicle theft, and burglary.',
          },
        },
        {
          '@type': 'Question',
          name: 'Are incident locations exact?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Locations are anonymized by the NYPD to the block level, so a dot marks a block, not an exact address.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do more dots mean an area is dangerous?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Not always. More reports don't always mean more danger. Busy areas simply report more.",
          },
        },
        {
          '@type': 'Question',
          name: 'Is the New York Safety Map free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Free, open source, no ads, no tracking.',
          },
        },
      ],
    },
  ],
}

/** index.html is authored for SF; this rewrites its city-specific tags for NYC. */
function nycHtml(): Plugin {
  return {
    name: 'nyc-html',
    transformIndexHtml(html) {
      if (city !== 'nyc') return html
      return html
        .replace(
          /<title>[\s\S]*?<\/title>/,
          '<title>New York Safety Map — NYC Crime Map</title>',
        )
        .replace(
          /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/>)/,
          '$1A free, open-source New York City crime and safety map. Search any NYC address and see real NYPD incident reports nearby — filterable by crime type, from NYC Open Data. No ads, no tracking.$2',
        )
        .replaceAll('https://citysafetymap.com/sf/', 'https://citysafetymap.com/nyc/')
        .replace(
          /(<meta\s+property="og:site_name"\s+content=")[^"]*(")/,
          '$1New York Safety Map$2',
        )
        .replace(
          /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
          '$1New York Safety Map — NYC Crime Map$2',
        )
        .replace(
          /(<meta\s+property="og:description"\s+content=")[\s\S]*?("\s*\/>)/,
          '$1Search any NYC address and see real NYPD incident reports nearby. Free, open source, no ads.$2',
        )
        .replace(
          /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
          '$1New York Safety Map — NYC Crime Map$2',
        )
        .replace(
          /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?("\s*\/>)/,
          '$1Search any NYC address and see real NYPD incident reports nearby. Free, no ads.$2',
        )
        .replace(
          /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
          `<script type="application/ld+json">${JSON.stringify(NYC_LD)}</script>`,
        )
    },
  }
}

export default defineConfig({
  plugins: [react(), nycHtml()],
  base: `/${city}/`,
  publicDir: city === 'sf' ? 'public' : `public-${city}`,
  define: { 'import.meta.env.VITE_CITY': JSON.stringify(city) },
})
