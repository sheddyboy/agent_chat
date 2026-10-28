"use client";

import { CalendarDays } from "lucide-react";
import { Card, Empty, useWidget } from "@/components/overview/card";
import { Timeline, useNow, type CalendarEvent, type Slot } from "@/components/overview/timeline";

type Schedule = { connected: false } | { connected: true; events: CalendarEvent[]; free: Slot[] };

export function ScheduleWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Schedule>("/overview/schedule");
  const now = useNow();

  if (!data || !data.connected || !now)
    return (
      <Card title="Today" icon={CalendarDays} index={index} loading={(!data || !now) && !error} error={error} className={className}>
        <Empty>Calendar is not connected.</Empty>
      </Card>
    );

  return (
    <Card title="Today" icon={CalendarDays} index={index} href="https://calendar.google.com" className={className}>
      <Timeline events={data.events} free={data.free} now={now} />
    </Card>
  );
}
