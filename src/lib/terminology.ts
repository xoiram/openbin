import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocationList } from '@/features/locations/useLocations';
import { useAuth } from '@/lib/auth';

export interface Terminology {
  bin: string;
  bins: string;
  Bin: string;
  Bins: string;
  location: string;
  locations: string;
  Location: string;
  Locations: string;
  area: string;
  areas: string;
  Area: string;
  Areas: string;
}

/** English defaults. useTerminology() localizes these via common:terms.*. */
export const DEFAULT_TERMINOLOGY: Terminology = {
  bin: 'bin',
  bins: 'bins',
  Bin: 'Bin',
  Bins: 'Bins',
  location: 'location',
  locations: 'locations',
  Location: 'Location',
  Locations: 'Locations',
  area: 'area',
  areas: 'areas',
  Area: 'Area',
  Areas: 'Areas',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parse pipe-delimited "singular|plural" term, falling back to defaults */
function parseTerm(raw: string, defaultSingular: string, defaultPlural: string): { singular: string; plural: string } {
  if (!raw) return { singular: defaultSingular, plural: defaultPlural };
  const parts = raw.split('|');
  const singular = parts[0]?.trim() || defaultSingular;
  const plural = parts[1]?.trim() || defaultPlural;
  return { singular, plural };
}

type TermPair = { singular: string; plural: string };
type TermSet = { bin: TermPair; location: TermPair; area: TermPair };

function buildTerminology({ bin, location, area }: TermSet): Terminology {
  return {
    bin: bin.singular,
    bins: bin.plural,
    Bin: capitalize(bin.singular),
    Bins: capitalize(bin.plural),
    location: location.singular,
    locations: location.plural,
    Location: capitalize(location.singular),
    Locations: capitalize(location.plural),
    area: area.singular,
    areas: area.plural,
    Area: capitalize(area.singular),
    Areas: capitalize(area.plural),
  };
}

/**
 * Admin-configured terms (Location.term_bin etc.) are used verbatim. Terms a
 * location hasn't customized (empty string, the DB default) fall back to the
 * default nouns in the active UI language (common:terms.*), so e.g. Norwegian
 * users see "boks"/"bokser" rather than "bin"/"bins".
 */
export function useTerminology(): Terminology {
  const { activeLocationId } = useAuth();
  const { locations } = useLocationList();
  const { t } = useTranslation('common');

  return useMemo(() => {
    const defaults: TermSet = {
      bin: {
        singular: t('terms.bin', { defaultValue: DEFAULT_TERMINOLOGY.bin }),
        plural: t('terms.bins', { defaultValue: DEFAULT_TERMINOLOGY.bins }),
      },
      location: {
        singular: t('terms.location', { defaultValue: DEFAULT_TERMINOLOGY.location }),
        plural: t('terms.locations', { defaultValue: DEFAULT_TERMINOLOGY.locations }),
      },
      area: {
        singular: t('terms.area', { defaultValue: DEFAULT_TERMINOLOGY.area }),
        plural: t('terms.areas', { defaultValue: DEFAULT_TERMINOLOGY.areas }),
      },
    };

    const loc = locations.find((l) => l.id === activeLocationId);
    if (!loc) return buildTerminology(defaults);

    return buildTerminology({
      bin: parseTerm(loc.term_bin, defaults.bin.singular, defaults.bin.plural),
      location: parseTerm(loc.term_location, defaults.location.singular, defaults.location.plural),
      area: parseTerm(loc.term_area, defaults.area.singular, defaults.area.plural),
    });
  }, [activeLocationId, locations, t]);
}
