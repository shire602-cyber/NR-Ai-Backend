import { StatCard } from "@/components/shared/StatCard";
import { DollarSign, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface FinancialSummaryCardsProps {
  revenue: string;
  expenses: string;
  netProfit: string;
  outstanding: string;
  revenueTrend?: number;
  expenseTrend?: number;
  profitTrend?: number;
  isLoading: boolean;
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-11 w-11 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialSummaryCards({
  revenue,
  expenses,
  netProfit,
  outstanding,
  revenueTrend,
  expenseTrend,
  profitTrend,
  isLoading,
}: FinancialSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Revenue"
        value={revenue}
        icon={DollarSign}
        trend={
          revenueTrend !== undefined
            ? { value: revenueTrend, isPositive: revenueTrend >= 0 }
            : undefined
        }
      />
      <StatCard
        title="Expenses"
        value={expenses}
        icon={CreditCard}
        trend={
          expenseTrend !== undefined
            ? { value: expenseTrend, isPositive: expenseTrend <= 0 }
            : undefined
        }
      />
      <StatCard
        title="Net Profit"
        value={netProfit}
        icon={TrendingUp}
        trend={
          profitTrend !== undefined
            ? { value: profitTrend, isPositive: profitTrend >= 0 }
            : undefined
        }
      />
      <StatCard
        title="Outstanding"
        value={outstanding}
        icon={AlertCircle}
      />
    </div>
  );
}
