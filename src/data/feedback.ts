export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'question', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ['new', 'processing', 'resolved', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_CATEGORY_I18N_KEYS = {
  bug: 'feedback.category.bug',
  feature: 'feedback.category.feature',
  question: 'feedback.category.question',
  other: 'feedback.category.other',
} as const satisfies Record<FeedbackCategory, string>;

export const FEEDBACK_STATUS_I18N_KEYS = {
  new: 'feedback.status.new',
  processing: 'feedback.status.processing',
  resolved: 'feedback.status.resolved',
  closed: 'feedback.status.closed',
} as const satisfies Record<FeedbackStatus, string>;

export const FEEDBACK_STATUS_STYLES = {
  new: 'bg-slate-500/15 text-slate-400',
  processing: 'bg-amber-500/15 text-amber-400',
  resolved: 'bg-green-500/15 text-green-400',
  closed: 'bg-slate-600/15 text-slate-500',
} as const satisfies Record<FeedbackStatus, string>;

export const FEEDBACK_LIMITS = {
  title: 100,
  content: 5000,
  contact: 200,
} as const;

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}
