"use client";

import Link from "next/link";
import { ArrowRight, Sun } from "lucide-react";
import { Streamdown } from "streamdown";
import { Card, useWidget } from "@/components/overview/card";

// While today's is being written the API answers 202 with only the job id
type Today = { heads_up?: string; job_id?: string | null };

// Today's heads up at the top of the Overview. With no briefing yet (the API says 404),
// it offers to write one; the Briefing page does that on open.
export function BriefingWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Today>("/briefing/today");

  return (
    <Card title="Heads up" icon={Sun} index={index} href="/briefing" loading={!data && !error} className={className}>
      {data?.heads_up ? (
        <div className="text-sm leading-relaxed [&_li]:my-0.5">
          <Streamdown linkSafety={{ enabled: false }}>{data.heads_up}</Streamdown>
        </div>
      ) : (
        <Link href="/briefing" className="group/link flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {data?.job_id ? "Writing today's briefing..." : "No briefing yet today. Write it now"}
          <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      )}
    </Card>
  );
}
