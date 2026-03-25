import { cn } from "@/lib/utils";

interface FinancialAmountProps {
  amount: number | string;
  currency?: string;
  className?: string;
  showSign?: boolean;
  colorize?: boolean;
}

export function FinancialAmount({
  amount,
  currency = "AED",
  className,
  showSign = false,
  colorize = false,
}: FinancialAmountProps) {
  const parsedAmount = typeof amount === "number" ? amount : parseFloat(String(amount));
  const numericAmount = isNaN(parsedAmount) ? 0 : parsedAmount;
  const isNegative = numericAmount < 0;

  const formatted = new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: showSign ? "exceptZero" : "auto",
  }).format(numericAmount);

  return (
    <span
      className={cn(
        "font-mono tabular-nums text-end",
        colorize && isNegative && "text-destructive",
        colorize && !isNegative && numericAmount > 0 && "text-success",
        className
      )}
    >
      {formatted}
    </span>
  );
}
