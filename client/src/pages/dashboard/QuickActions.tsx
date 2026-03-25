import { Button } from "@/components/ui/button";
import { FileText, Camera, BookOpen, BarChart3 } from "lucide-react";
import { Link } from "wouter";

const actions = [
  { label: "New Invoice", icon: FileText, href: "/invoices" },
  { label: "Scan Receipt", icon: Camera, href: "/receipts" },
  { label: "Journal Entry", icon: BookOpen, href: "/journal" },
  { label: "View Reports", icon: BarChart3, href: "/reports" },
] as const;

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link key={action.label} href={action.href}>
            <Button variant="outline" className="gap-2">
              <Icon className="h-4 w-4" />
              {action.label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}
