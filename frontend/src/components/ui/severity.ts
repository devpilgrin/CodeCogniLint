/**
 * Единый источник severity/category-стилей.
 * Цвета — семантические токены из @theme в index.css (GitHub Dark).
 * critical ВЕЗДЕ красный (severity-critical), без локальных оранжевых карт.
 */

/** Карточка/контейнер находки: рамка + подложка + hover. */
export const severityStyles: Record<string, string> = {
  critical: 'border-severity-critical/40 bg-severity-critical/5 hover:bg-severity-critical/10',
  warning: 'border-severity-warning/40 bg-severity-warning/5 hover:bg-severity-warning/10',
  info: 'border-severity-info/40 bg-severity-info/5 hover:bg-severity-info/10',
};

/** Компактный бейдж severity (текст + подложка). */
export const severityBadge: Record<string, string> = {
  critical: 'text-severity-critical bg-severity-critical/10',
  warning: 'text-severity-warning bg-severity-warning/10',
  info: 'text-severity-info bg-severity-info/10',
};

/** Только цвет текста по severity (сводки, таблицы, точки-индикаторы). */
export const severityText: Record<string, string> = {
  critical: 'text-severity-critical',
  warning: 'text-severity-warning',
  info: 'text-severity-info',
};

/** Бейджи категорий правил анализа. */
export const categoryBadge: Record<string, string> = {
  syntax: 'text-blue-300 bg-blue-300/10',
  semantic: 'text-purple-300 bg-purple-300/10',
  analysis: 'text-orange-300 bg-orange-300/10',
};
