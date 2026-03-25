import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  // Positive
  paid: "bg-success/10 text-success border-success/20",
  posted: "bg-success/10 text-success border-success/20",
  complete: "bg-success/10 text-success border-success/20",
  active: "bg-success/10 text-success border-success/20",
  approved: "bg-success/10 text-success border-success/20",
  // Info
  sent: "bg-info/10 text-info border-info/20",
  submitted: "bg-info/10 text-info border-info/20",
  // Warning
  draft: "bg-warning/10 text-warning border-warning/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  partial: "bg-warning/10 text-warning border-warning/20",
  // Danger
  void: "bg-destructive/10 text-destructive border-destructive/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  // Neutral
  inactive: "bg-muted text-muted-foreground border-muted",
} as const;

type StatusType = keyof typeof STATUS_STYLES;

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[^a-z]/g, "") as StatusType;
  const styles = STATUS_STYLES[normalized] || STATUS_STYLES.inactive;

  return (
    <Badge variant="outline" className={cn("font-medium capitalize", styles, className)}>
      {status}
    </Badge>
  );
}
