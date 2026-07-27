import type { DayKey } from './planner';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  message: string;
  at: string;
}

export interface Recommendation {
  type: 'move' | 'delete' | 'atomize' | 'reorder-light' | 'none';
  title: string;
  message: string;
  metrics?: string;
  taskText?: string;
  items?: string[];
  toDay?: DayKey;
}
