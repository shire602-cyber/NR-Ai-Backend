import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, FileText } from "lucide-react";
import { Link } from "wouter";

interface AttentionItem {
  label: string;
  count: number;
  icon: React.ElementType;
  href: string;
  variant: "destructive" | "warning";
}

interface AttentionPanelProps {
  overdueInvoices: number;
  pendingJournalEntries: number;
}

export function AttentionPanel({
  overdueInvoices,
  pendingJournalEntries,
}: AttentionPanelProps) {
  const items: AttentionItem[] = [];

  if (overdueInvoices > 0) {
    items.push({
      label: "Overdue invoices",
      count: overdueInvoices,
      icon: AlertTriangle,
      href: "/invoices",
      variant: "destructive",
    });
  }

  if (pendingJournalEntries > 0) {
    items.push({
      label: "Pending journal entries",
      count: pendingJournalEntries,
      icon: Clock,
      href: "/journal",
      variant: "warning",
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Needs Your Attention
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${
                        item.variant === "destructive"
                          ? "text-destructive"
                          : "text-warning"
                      }`}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <Badge
                    variant={
                      item.variant === "destructive" ? "destructive" : "outline"
                    }
                    className={
                      item.variant === "warning"
                        ? "bg-warning/10 text-warning border-warning/20"
                        : undefined
                    }
                  >
                    {item.count}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
