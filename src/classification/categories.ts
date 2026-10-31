export const WEBSITE_CATEGORIES = [
  'Learning',
  'Coding & Development',
  'Documentation',
  'Academic',
  'Professional Work',
  'Communication',
  'Social Media',
  'Entertainment',
  'Gaming',
  'Shopping',
  'Unknown',
] as const;

export type WebsiteCategory = (typeof WEBSITE_CATEGORIES)[number];

export const PRODUCTIVITY_VALUES = ['productive', 'recreational', 'neutral', 'unknown'] as const;
export type ProductivityValue = (typeof PRODUCTIVITY_VALUES)[number];

export interface CategoryDefinition {
  name: WebsiteCategory;
  defaultProductivity: ProductivityValue;
}

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  { name: 'Learning', defaultProductivity: 'productive' },
  { name: 'Coding & Development', defaultProductivity: 'neutral' },
  { name: 'Documentation', defaultProductivity: 'productive' },
  { name: 'Academic', defaultProductivity: 'productive' },
  { name: 'Professional Work', defaultProductivity: 'neutral' },
  { name: 'Communication', defaultProductivity: 'neutral' },
  { name: 'Social Media', defaultProductivity: 'neutral' },
  { name: 'Entertainment', defaultProductivity: 'recreational' },
  { name: 'Gaming', defaultProductivity: 'recreational' },
  { name: 'Shopping', defaultProductivity: 'recreational' },
  { name: 'Unknown', defaultProductivity: 'unknown' },
];

export function defaultProductivityFor(category: WebsiteCategory): ProductivityValue {
  return CATEGORY_DEFINITIONS.find((item) => item.name === category)?.defaultProductivity ?? 'unknown';
}
