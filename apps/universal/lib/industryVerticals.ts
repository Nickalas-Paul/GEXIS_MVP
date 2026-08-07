/** Client-facing industry vertical catalog (labels). Weights live on the API. */

export type IndustryVerticalOption = {
  key: string;
  label: string;
};

export const INDUSTRY_VERTICAL_OPTIONS: IndustryVerticalOption[] = [
  { key: 'all', label: 'All Industries' },
  { key: 'tech_saas', label: 'Technology & SaaS' },
  { key: 'financial', label: 'Financial Services' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'healthcare', label: 'Healthcare & Life Sciences' },
  { key: 'ecommerce', label: 'E-Commerce & Retail' },
  { key: 'energy', label: 'Energy & Renewables' },
  { key: 'professional', label: 'Professional Services' },
  { key: 'logistics', label: 'Logistics & Supply Chain' },
  { key: 'telecom', label: 'Telecommunications' },
  { key: 'consumer_goods', label: 'Consumer Goods & CPG' },
];

export const DEFAULT_INDUSTRY_VERTICAL = 'all';

export function verticalLabel(key: string): string {
  return (
    INDUSTRY_VERTICAL_OPTIONS.find((v) => v.key === key)?.label ??
    INDUSTRY_VERTICAL_OPTIONS[0].label
  );
}
