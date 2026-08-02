export type InsightTitleOrigin = 'capture' | 'fallback' | 'metadata' | 'user';

export type Insight = {
  categoryId: string | null;
  createdAt: string;
  domain: string;
  id: string;
  memo: string | null;
  normalizedUrl: string;
  originalUrl: string;
  title: string;
  titleOrigin: InsightTitleOrigin;
  updatedAt: string;
};
