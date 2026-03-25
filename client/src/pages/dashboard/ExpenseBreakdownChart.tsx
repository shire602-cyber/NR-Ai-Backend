import { ChartCard } from "@/components/shared/ChartCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

interface ExpenseCategory {
  name: string;
  value: number;
}

interface ExpenseBreakdownChartProps {
  data: ExpenseCategory[] | undefined;
  isLoading: boolean;
  formatValue?: (value: number) => string;
  onCategoryClick?: (category: string) => void;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ExpenseBreakdownChart({
  data,
  isLoading,
  formatValue,
  onCategoryClick,
}: ExpenseBreakdownChartProps) {
  return (
    <ChartCard title="Expense Breakdown" description="By category">
      {isLoading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              labelLine={false}
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              onClick={(entry) => {
                if (onCategoryClick && entry?.name) {
                  onCategoryClick(entry.name);
                }
              }}
              style={{ cursor: onCategoryClick ? "pointer" : "default" }}
            >
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
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
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          No expense data yet
        </div>
      )}
    </ChartCard>
  );
}
