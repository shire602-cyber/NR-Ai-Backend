import { Download, FileSpreadsheet, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToExcel, type ExportColumn } from "@/lib/export";

interface ExportDropdownProps {
  data: Record<string, any>[];
  filename: string;
  columns?: { key: string; label: string }[];
}

export function ExportDropdown({ data, filename, columns }: ExportDropdownProps) {
  const exportColumns: ExportColumn[] = columns
    ? columns.map((col) => ({ header: col.label, key: col.key, width: 18 }))
    : data.length > 0
      ? Object.keys(data[0]).map((key) => ({ header: key, key, width: 18 }))
      : [];

  const handleExportExcel = () => {
    exportToExcel(
      [
        {
          columns: exportColumns,
          rows: data,
          sheetName: filename,
        },
      ],
      filename
    );
  };

  const handleExportCSV = () => {
    const headers = exportColumns.map((col) => col.header);
    const rows = data.map((row) =>
      exportColumns.map((col) => {
        const value = row[col.key];
        const str = value !== undefined && value !== null ? String(value) : "";
        // Escape commas and quotes for CSV
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
    );

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportExcel}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV}>
          <Sheet className="h-4 w-4 mr-2" />
          Export to CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
