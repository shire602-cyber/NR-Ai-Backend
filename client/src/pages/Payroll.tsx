import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Banknote,
  Plus,
  CheckCircle,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrency } from '@/lib/format';
import type { PayrollRun, PayrollLine } from '@shared/schema';

// ─── Types ────────────────────────────────────────────────

interface PayrollRunWithLines extends PayrollRun {
  lines: (PayrollLine & {
    employeeName: string;
    employeeNumber: string;
    bankAccountNumber: string;
    bankIban: string;
  })[];
}

// ─── Schemas ──────────────────────────────────────────────

const newRunFormSchema = z.object({
  period: z.string().min(1, 'Period is required (e.g. 2026-03)'),
  runDate: z.string().min(1, 'Run date is required'),
});

type NewRunFormData = z.infer<typeof newRunFormSchema>;

// ─── Component ────────────────────────────────────────────

export default function Payroll() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { companyId, isLoading: isLoadingCompany } = useDefaultCompany();
  const { canAccess, getRequiredTier } = useSubscription();

  const [newRunDialogOpen, setNewRunDialogOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // ─── Queries ──────────────────────────────────────────

  const { data: payrollRuns = [], isLoading } = useQuery<PayrollRun[]>({
    queryKey: [`/api/companies/${companyId}/payroll`],
    enabled: !!companyId,
  });

  // Fetch detail for expanded run
  const { data: expandedRunDetail } = useQuery<PayrollRunWithLines>({
    queryKey: [`/api/payroll/${expandedRunId}`],
    enabled: !!expandedRunId,
  });

  // ─── Form ─────────────────────────────────────────────

  const form = useForm<NewRunFormData>({
    resolver: zodResolver(newRunFormSchema),
    defaultValues: {
      period: format(new Date(), 'yyyy-MM'),
      runDate: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  // ─── Mutations ────────────────────────────────────────

  const createRunMutation = useMutation({
    mutationFn: (data: NewRunFormData) =>
      apiRequest('POST', `/api/companies/${companyId}/payroll`, {
        period: data.period,
        runDate: new Date(data.runDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll`] });
      toast({ title: 'Payroll Run Created', description: 'Draft payroll run has been created with all active employees.' });
      setNewRunDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error?.message, variant: 'destructive' });
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('POST', `/api/payroll/${id}/approve`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll`] });
      queryClient.invalidateQueries({ queryKey: [`/api/payroll/${id}`] });
      toast({ title: 'Run Approved', description: 'Payroll run has been approved.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error?.message, variant: 'destructive' });
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/payroll/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll`] });
      setExpandedRunId(null);
      toast({ title: 'Run Deleted', description: 'Draft payroll run has been deleted.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error?.message, variant: 'destructive' });
    },
  });

  // ─── Handlers ─────────────────────────────────────────

  const handleCreateRun = (data: NewRunFormData) => {
    createRunMutation.mutate(data);
  };

  const handleToggleExpand = (runId: string) => {
    setExpandedRunId(prev => prev === runId ? null : runId);
  };

  const handleGenerateWps = async (runId: string, period: string) => {
    try {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/payroll/${runId}/generate-wps`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.message || 'Failed to generate WPS file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WPS_SIF_${period}.SIF`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll`] });
      toast({ title: 'WPS File Generated', description: 'SIF file has been downloaded.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ─── Helpers ──────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'approved':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Approved</Badge>;
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const totalPayroll = payrollRuns.reduce((sum, r) => sum + (r.totalNetPay || 0), 0);
  const draftCount = payrollRuns.filter(r => r.status === 'draft').length;
  const approvedCount = payrollRuns.filter(r => r.status === 'approved').length;

  if (!canAccess('payroll')) {
    return <UpgradePrompt feature="payroll" requiredTier={getRequiredTier('payroll')} />;
  }

  if (isLoadingCompany || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Manage payroll runs and WPS file generation</p>
        </div>
        <Button onClick={() => setNewRunDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Payroll Run
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payrollRuns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{draftCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Net Pay (All Runs)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPayroll, 'AED', locale)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Runs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll Runs</CardTitle>
          <CardDescription>Click a row to view employee details for that run</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Period</TableHead>
                <TableHead>Run Date</TableHead>
                <TableHead className="text-center">Employees</TableHead>
                <TableHead className="text-right">Total Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>WPS</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No payroll runs yet. Create your first run to get started.
                  </TableCell>
                </TableRow>
              ) : (
                payrollRuns.map((run) => (
                  <>
                    {/* Run Row */}
                    <TableRow
                      key={run.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleToggleExpand(run.id)}
                    >
                      <TableCell>
                        {expandedRunId === run.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{run.period}</TableCell>
                      <TableCell>
                        {run.runDate ? format(new Date(run.runDate), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-center">{run.employeeCount || 0}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(run.totalNetPay || 0, 'AED', locale)}
                      </TableCell>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell>
                        {run.wpsFileGenerated ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <FileText className="h-3 w-3 mr-1" />
                            Generated
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not generated</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {run.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => approveRunMutation.mutate(run.id)}
                              disabled={approveRunMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          )}
                          {run.status !== 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleGenerateWps(run.id, run.period)}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              WPS
                            </Button>
                          )}
                          {run.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this draft payroll run?')) {
                                  deleteRunMutation.mutate(run.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Detail Row */}
                    {expandedRunId === run.id && (
                      <TableRow key={`${run.id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-4">
                            <h4 className="font-semibold mb-3">Employee Payroll Lines</h4>
                            {expandedRunDetail?.lines ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Employee #</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Basic Salary</TableHead>
                                    <TableHead className="text-right">Housing</TableHead>
                                    <TableHead className="text-right">Transport</TableHead>
                                    <TableHead className="text-right">Other</TableHead>
                                    <TableHead className="text-right">Deductions</TableHead>
                                    <TableHead className="text-right font-bold">Net Pay</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {expandedRunDetail.lines.map((line) => (
                                    <TableRow key={line.id}>
                                      <TableCell className="font-mono text-sm">
                                        {line.employeeNumber}
                                      </TableCell>
                                      <TableCell>{line.employeeName}</TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatCurrency(line.basicSalary || 0, 'AED', locale)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatCurrency(line.housingAllowance || 0, 'AED', locale)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatCurrency(line.transportAllowance || 0, 'AED', locale)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatCurrency(line.otherAllowances || 0, 'AED', locale)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-red-600">
                                        {formatCurrency(line.deductions || 0, 'AED', locale)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono font-bold">
                                        {formatCurrency(line.netPay || 0, 'AED', locale)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {/* Totals Row */}
                                  <TableRow className="font-bold border-t-2">
                                    <TableCell colSpan={2}>Total</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.basicSalary || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.housingAllowance || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.transportAllowance || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.otherAllowances || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-red-600">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.deductions || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatCurrency(
                                        expandedRunDetail.lines.reduce((s, l) => s + (l.netPay || 0), 0),
                                        'AED', locale,
                                      )}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            ) : (
                              <div className="flex items-center justify-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Payroll Run Dialog */}
      <Dialog open={newRunDialogOpen} onOpenChange={setNewRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
            <DialogDescription>
              Create a draft payroll run. All active employees will be automatically included.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateRun)} className="space-y-4">
              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay Period *</FormLabel>
                    <FormControl>
                      <Input type="month" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="runDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Run Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setNewRunDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRunMutation.isPending}>
                  {createRunMutation.isPending && (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  Create Draft Run
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
