import type { CalendarEvent, Slot } from "@/components/overview/timeline";

// A part the backend could not fetch carries a note instead of data
type Part<T> = ({ ok: true } & T) | { ok: false; note: string };

export type MailPick = { id: string; from: string; subject: string; why: string; date: string };

// One response of GET /briefing/{day} and POST /briefing
export type Briefing = {
  day: string;
  created_at: string;
  thread_id: string;
  heads_up: string;
  mail: MailPick[];
  mail_text: string;
  mail_note: string | null;
  today: Part<{ events: CalendarEvent[]; free: Slot[] }> | null;
  tomorrow: Part<{ events: CalendarEvent[] }> | null;
  weather: Part<{ temp: number; code: number; sky: string; min: number; max: number; rain: number }> | null;
};
