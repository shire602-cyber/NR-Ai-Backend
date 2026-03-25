import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FinancialAmount } from "@/components/shared/FinancialAmount";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/format";

interface ActivityItem {
  id: string;
  type: "invoice" | "journal";
  description: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  href: string;
}

interface RecentActivityProps {
  invoices: any[] | undefined;
  journalEntries: any[] | undefined;
  isLoading: boolean;
  locale: string;
}

function mergeAndSort(
  invoices: any[] | undefined,
  journalEntries: any[] | undefined
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (invoices) {
    for (const inv of invoices) {
      items.push({
        id: `inv-${inv.id}`,
        type: "invoice",
        description: inv.customerName || `INV-${inv.number}`,
        amount: inv.total || 0,
        currency: inv.currency || "AED",
        status: inv.status || "draft",
        date: inv.date || inv.createdAt,
        href: "/invoices",
      });
    }
  }

  if (journalEntries) {
    for (const entry of journalEntries) {
      const totalDebit =
        entry.lines?.reduce(
          (sum: number, l: any) => sum + (parseFloat(l.debit) || 0),
          0
        ) || 0;
      items.push({
        id: `je-${entry.id}`,
        type: "journal",
        description: entry.memo || "Journal Entry",
        amount: totalDebit,
        currency: "AED",
        status: entry.status || "posted",
        date: entry.date || entry.createdAt,
        href: "/journal",
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return items.slice(0, 10);
}

export function RecentActivity({
  invoices,
  journalEntries,
  isLoading,
  locale,
}: RecentActivityProps) {
  const items = mergeAndSort(invoices, journalEntries);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={item.id} href={item.href}>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(item.date, locale)}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {item.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <FinancialAmount
                      amount={item.amount}
                      currency={item.currency}
                      className="text-sm"
                    />
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No recent activity
          </div>
        )}
      </CardContent>
    </Card>
  );
}
