// A saved place; `id` is null for the browser's current location
export type Place = { id: number | null; name: string; region: string; country: string; lat: number; lon: number; is_home: number };

// A search result from GET /weather/search
export type Found = Omit<Place, "id" | "is_home">;

export type Hour = { time: string; temp: number; code: number; rain: number; mm: number; is_day: boolean };
export type Day = { date: string; code: number; min: number; max: number; rain: number; sunrise: string; sunset: string };

// One response of GET /weather. Times are local to the place, like "2026-10-28T15:00"
export type Forecast = {
  time: string;
  fetched_at: number;
  place: Place;
  current: { temp: number; feels_like: number; code: number; sky: string; is_day: boolean; wind: number; gusts: number; humidity: number; uv: number };
  hourly: Hour[];
  daily: Day[];
  summary: string;
  alert: string | null;
};
