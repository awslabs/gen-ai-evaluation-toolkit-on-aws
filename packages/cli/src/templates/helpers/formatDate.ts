import { HelperDelegate } from 'handlebars';

export function formatDate(context: Parameters<HelperDelegate>[0]) {
  if (!context) return '';
  if (typeof context === 'number') return new Date(context).toLocaleString();
  return context.toLocaleString();
}
