import { ChartCard } from "@/components/shared/ChartCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface MonthlyTrend {
  month: string;
  revenue: number;
  expenses: number;
}

interface RevenueExpenseChartProps {
  data: MonthlyTrend[] | undefined;
  isLoading: boolean;
  formatValue?: (value: number) => string;
  onMonthClick?: (month: string) => void;
}

export function RevenueExpenseChart({
  data,
  isLoading,
  formatValue,
  onMonthClick,
}: RevenueExpenseChartProps) {
  return (
    <ChartCard title="Revenue vs Expenses" description="Last 6 months">
      {isLoading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={data}
            onClick={(e) => {
              if (e?.activeLabel && onMonthClick) {
                onMonthClick(e.activeLabel);
              }
            }}
          >
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value: number) =>
                formatValue ? formatValue(value) : value.toLocaleString()
              }
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradRevenue)"
              name="Revenue"
              style={{ cursor: onMonthClick ? "pointer" : "default" }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="hsl(var(--chart-4))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradExpenses)"
              name="Expenses"
              style={{ cursor: onMonthClick ? "pointer" : "default" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          No revenue data yet
        </div>
      )}
    </ChartCard>
  );
}
