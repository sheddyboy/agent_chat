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
    <div className="space-y-2 rounded-xl border border-amber-500/50 p-3 text-sm">
      <p className="font-medium">The agent wants to run:</p>
      {toolCalls.map((c) => (
        <div key={c.id}>
          <span className="font-mono">{c.name}</span>
          <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
            {JSON.stringify(c.args, null, 2)}
          </pre>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled} onClick={() => onDecide("approve")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onDecide("reject")}>
          Reject
        </Button>
      </div>
    </div>
  );
}
