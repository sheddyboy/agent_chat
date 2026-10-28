"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { BriefingWidget } from "@/components/overview/briefing";
import { InboxWidget } from "@/components/overview/inbox";
import { RecentChatsWidget } from "@/components/overview/recent-chats";
import { ResumeWidget } from "@/components/overview/resume";
import { ScheduleWidget } from "@/components/overview/schedule";
import { StatusWidget } from "@/components/overview/status";
import { WeatherWidget } from "@/components/overview/weather";

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// Home: widgets to glance at, each loading on its own. Adding one means a new file in
// components/overview and a line here.
export default function Overview() {
  const [showSidebar, setShowSidebar] = useState(false);
  // Set after mount, so the server render and the browser's clock never disagree
  const [today, setToday] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setToday(new Date()), []);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="text-sm font-medium">Overview</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
            <div className="h-16 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
              {today && (
                <>
                  <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                    {today.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(today.getHours())}</h2>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <BriefingWidget index={0} className="md:col-span-2 xl:col-span-3" />
              <ScheduleWidget index={1} className="md:row-span-2 xl:col-span-2" />
              <WeatherWidget index={2} />
              <InboxWidget index={3} />
              <RecentChatsWidget index={4} className="md:row-span-2 xl:col-span-2" />
              <StatusWidget index={5} />
              <ResumeWidget index={6} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
