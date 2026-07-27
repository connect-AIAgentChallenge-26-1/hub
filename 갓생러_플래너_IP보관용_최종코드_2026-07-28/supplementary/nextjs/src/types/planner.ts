export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export type EnergyLevel = 'high' | 'mid' | 'low';

export type Mode = 'student' | 'worker';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  durationMinutes: number;
  urgency: number;
  details: string[];
  source: 'manual' | 'upload';
}

export interface DayPlan {
  title: string;
  description: string;
  tasks: Task[];
}

export interface DayScheduleWindow {
  plannedStart: string;
  plannedEnd: string;
  actualEnd: string;
  lastHandledSignature?: string;
}

export interface TimeBlock {
  id: string;
  start: number;
  end: number;
  task: string;
  priority: 'High' | 'Medium' | 'Low';
  overflow: boolean;
}

export interface GodScoreMetrics {
  score: number;
  completion: number;
  focusAchievement: number;
  streakBonus: number;
}
