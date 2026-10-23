import { Check, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToolCall = { id: string; name: string; args: unknown };

export function ApprovalCard({
  toolCalls,
  disabled,
  onDecide,
}: {
  toolCalls: ToolCall[];
  disabled: boolean;
  onDecide: (action: "approve" | "reject") => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/5 text-sm">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-3 py-2 font-medium text-amber-600 dark:text-amber-400">
        <ShieldAlert className="size-4" />
        Approval needed
      </div>
      <div className="space-y-3 p-3">
        {toolCalls.map((c) => (
          <div key={c.id}>
            <span className="font-mono text-xs">{c.name}</span>
            <pre className="mt-1 overflow-x-auto rounded-md border bg-background p-2 font-mono text-xs text-muted-foreground">
              {JSON.stringify(c.args, null, 2)}
            </pre>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onDecide("approve")}>
            <Check /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onDecide("reject")}>
            <X /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
