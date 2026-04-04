import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  Search,
  CalendarClock,
  Ban,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrency, formatDate } from '@/lib/format';

// ─── Schemas ──────────────────────────────────────────────

const assetFormSchema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  assetCode: z.string().min(1, 'Asset code is required'),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be >= 0'),
  residualValue: z.coerce.number().min(0, 'Residual value must be >= 0'),
  usefulLifeMonths: z.coerce.number().min(1, 'Useful life must be at least 1 month'),
  depreciationMethod: z.enum(['straight_line', 'declining_balance']),
  assetAccountId: z.string().optional().nullable(),
  depreciationExpenseAccountId: z.string().optional().nullable(),
  accumulatedDepAccountId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type AssetFormData = z.infer<typeof assetFormSchema>;

interface FixedAsset {
  id: string;
  companyId: string;
  name: string;
  assetCode: string;
  description: string | null;
  categoryId: string | null;
  purchaseDate: string;
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  assetAccountId: string | null;
  depreciationExpenseAccountId: string | null;
  accumulatedDepAccountId: string | null;
  location: string | null;
  serialNumber: string | null;
  notes: string | null;
  status: string;
  accumulatedDepreciation: number;
  bookValue: number;
  createdAt: string;
}

interface AssetCategory {
  id: string;
  companyId: string;
  name: string;
  defaultUsefulLifeMonths: number | null;
  defaultDepreciationMethod: string | null;
}

interface Account {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface DepreciationEntry {
  id: string;
  assetId: string;
  assetName: string;
  period: string;
  amount: number;
  accumulatedAmount: number;
  bookValue: number;
}

// ─── Component ────────────────────────────────────────────

export default function FixedAssets() {
  const { locale } = useTranslation();
  const { toast } = useToast();
  const { companyId, isLoading: isLoadingCompany } = useDefaultCompany();
  const { canAccess, getRequiredTier } = useSubscription();

  if (!canAccess('fixedAssets')) {
    return <UpgradePrompt feature="fixedAssets" requiredTier={getRequiredTier('fixedAssets')} />;
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('assets');

  // ─── Queries ──────────────────────────────────────────

  const { data: assets = [], isLoading } = useQuery<FixedAsset[]>({
    queryKey: [`/api/companies/${companyId}/fixed-assets`],
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery<AssetCategory[]>({
    queryKey: [`/api/companies/${companyId}/fixed-asset-categories`],
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: [`/api/companies/${companyId}/accounts`],
    enabled: !!companyId,
  });

  const { data: depreciationSchedule = [] } = useQuery<DepreciationEntry[]>({
    queryKey: [`/api/companies/${companyId}/fixed-assets/depreciation-schedule`],
    enabled: !!companyId && activeTab === 'depreciation',
  });

  // ─── Derived data ────────────────────────────────────

  const assetAccounts = accounts.filter((a) => a.type === 'asset');
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');

  const totalAssetValue = assets.reduce((sum, a) => sum + (a.purchasePrice || 0), 0);
  const totalAccumulatedDep = assets.reduce((sum, a) => sum + (a.accumulatedDepreciation || 0), 0);
  const totalNetBookValue = assets.reduce((sum, a) => sum + (a.bookValue || 0), 0);
  const activeAssets = assets.filter((a) => a.status === 'active').length;

  // ─── Form ─────────────────────────────────────────────

  const form = useForm<AssetFormData>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: '',
      assetCode: '',
      description: '',
      categoryId: '',
      purchaseDate: '',
      purchasePrice: 0,
      residualValue: 0,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      assetAccountId: '',
      depreciationExpenseAccountId: '',
      accumulatedDepAccountId: '',
      location: '',
      serialNumber: '',
      notes: '',
    },
  });

  // ─── Mutations ────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      const res = await apiRequest('POST', `/api/companies/${companyId}/fixed-assets`, {
        ...data,
        purchaseDate: new Date(data.purchaseDate).toISOString(),
        categoryId: data.categoryId || null,
        assetAccountId: data.assetAccountId || null,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId || null,
        accumulatedDepAccountId: data.accumulatedDepAccountId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/fixed-assets`] });
      toast({ title: 'Asset Created', description: 'Fixed asset has been added successfully.' });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AssetFormData> }) => {
      const res = await apiRequest('PUT', `/api/companies/${companyId}/fixed-assets/${id}`, {
        ...data,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate).toISOString() : undefined,
        categoryId: data.categoryId || null,
        assetAccountId: data.assetAccountId || null,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId || null,
        accumulatedDepAccountId: data.accumulatedDepAccountId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/fixed-assets`] });
      toast({ title: 'Asset Updated', description: 'Fixed asset has been updated successfully.' });
      setDialogOpen(false);
      setEditingAsset(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/companies/${companyId}/fixed-assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/fixed-assets`] });
      toast({ title: 'Asset Deleted', description: 'Fixed asset has been removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const disposeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/companies/${companyId}/fixed-assets/${id}/dispose`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/fixed-assets`] });
      toast({ title: 'Asset Disposed', description: 'Fixed asset has been marked as disposed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const generateScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        'POST',
        `/api/companies/${companyId}/fixed-assets/${id}/generate-schedule`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/fixed-assets`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/fixed-assets/depreciation-schedule`],
      });
      toast({
        title: 'Schedule Generated',
        description: 'Depreciation schedule has been generated.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // ─── Handlers ─────────────────────────────────────────

  const handleOpenCreateDialog = () => {
    setEditingAsset(null);
    form.reset({
      name: '',
      assetCode: '',
      description: '',
      categoryId: '',
      purchaseDate: '',
      purchasePrice: 0,
      residualValue: 0,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      assetAccountId: '',
      depreciationExpenseAccountId: '',
      accumulatedDepAccountId: '',
      location: '',
      serialNumber: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (asset: FixedAsset) => {
    setEditingAsset(asset);
    form.reset({
      name: asset.name,
      assetCode: asset.assetCode,
      description: asset.description || '',
      categoryId: asset.categoryId || '',
      purchaseDate: asset.purchaseDate ? format(new Date(asset.purchaseDate), 'yyyy-MM-dd') : '',
      purchasePrice: asset.purchasePrice || 0,
      residualValue: asset.residualValue || 0,
      usefulLifeMonths: asset.usefulLifeMonths || 60,
      depreciationMethod:
        (asset.depreciationMethod as 'straight_line' | 'declining_balance') || 'straight_line',
      assetAccountId: asset.assetAccountId || '',
      depreciationExpenseAccountId: asset.depreciationExpenseAccountId || '',
      accumulatedDepAccountId: asset.accumulatedDepAccountId || '',
      location: asset.location || '',
      serialNumber: asset.serialNumber || '',
      notes: asset.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: AssetFormData) => {
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // ─── Helpers ──────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'disposed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Disposed</Badge>;
      case 'fully_depreciated':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            Fully Depreciated
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '-';
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name || '-';
  };

  const filteredAssets = assets.filter((asset) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      asset.name.toLowerCase().includes(q) ||
      asset.assetCode.toLowerCase().includes(q) ||
      (asset.location?.toLowerCase().includes(q) ?? false) ||
      (asset.serialNumber?.toLowerCase().includes(q) ?? false)
    );
  });

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
          <h1 className="text-3xl font-bold tracking-tight">Fixed Assets</h1>
          <p className="text-muted-foreground">
            Track, depreciate, and manage your company fixed assets
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Asset Value</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalAssetValue, 'AED', locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accumulated Depreciation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalAccumulatedDep, 'AED', locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Book Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalNetBookValue, 'AED', locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAssets}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assets">Assets List</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation Schedule</TabsTrigger>
        </TabsList>

        {/* ── Assets List Tab ── */}
        <TabsContent value="assets" className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead className="text-right">Purchase Price</TableHead>
                    <TableHead className="text-right">Book Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {searchQuery
                          ? 'No assets match your search'
                          : 'No fixed assets yet. Add your first asset to get started.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono text-sm">{asset.assetCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{asset.name}</div>
                            {asset.serialNumber && (
                              <div className="text-sm text-muted-foreground">
                                S/N: {asset.serialNumber}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getCategoryName(asset.categoryId)}</TableCell>
                        <TableCell>
                          {asset.purchaseDate ? formatDate(asset.purchaseDate, locale) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(asset.purchasePrice || 0, 'AED', locale)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(asset.bookValue || 0, 'AED', locale)}
                        </TableCell>
                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit"
                              onClick={() => handleOpenEditDialog(asset)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Generate Schedule"
                              disabled={
                                asset.status === 'disposed' ||
                                generateScheduleMutation.isPending
                              }
                              onClick={() => generateScheduleMutation.mutate(asset.id)}
                            >
                              <CalendarClock className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Dispose"
                              disabled={asset.status !== 'active' || disposeMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Are you sure you want to dispose of "${asset.name}"? This cannot be undone.`,
                                  )
                                ) {
                                  disposeMutation.mutate(asset.id);
                                }
                              }}
                            >
                              <Ban className="h-4 w-4 text-orange-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Are you sure you want to delete this asset?',
                                  )
                                ) {
                                  deleteMutation.mutate(asset.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories Tab ── */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Asset Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category Name</TableHead>
                    <TableHead>Default Useful Life</TableHead>
                    <TableHead>Default Method</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No asset categories defined.
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell>
                          {cat.defaultUsefulLifeMonths
                            ? `${cat.defaultUsefulLifeMonths} months (${(cat.defaultUsefulLifeMonths / 12).toFixed(1)} years)`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {cat.defaultDepreciationMethod === 'straight_line'
                            ? 'Straight Line'
                            : cat.defaultDepreciationMethod === 'declining_balance'
                              ? 'Declining Balance'
                              : cat.defaultDepreciationMethod || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {assets.filter((a) => a.categoryId === cat.id).length}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Depreciation Schedule Tab ── */}
        <TabsContent value="depreciation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Depreciation Schedule</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Depreciation Amount</TableHead>
                    <TableHead className="text-right">Accumulated</TableHead>
                    <TableHead className="text-right">Book Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depreciationSchedule.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No depreciation entries yet. Generate a schedule from the Assets tab.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depreciationSchedule.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.assetName}</TableCell>
                        <TableCell>{entry.period}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.amount, 'AED', locale)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.accumulatedAmount, 'AED', locale)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.bookValue, 'AED', locale)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Asset Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit Fixed Asset' : 'Add Fixed Asset'}</DialogTitle>
            <DialogDescription>
              {editingAsset
                ? 'Update the asset details below.'
                : 'Fill in the details to register a new fixed asset.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
                  <TabsTrigger value="accounts">Accounts & Notes</TabsTrigger>
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="assetCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Code *</FormLabel>
                          <FormControl>
                            <Input placeholder="FA-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Office Building" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Brief description of the asset"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ''}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="purchaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Purchase Date *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="purchasePrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Purchase Price (AED) *</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="residualValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Residual Value (AED)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Main Office, Warehouse, etc."
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Serial Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="SN-123456"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* Depreciation Tab */}
                <TabsContent value="depreciation" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="depreciationMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Depreciation Method *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="straight_line">Straight Line</SelectItem>
                              <SelectItem value="declining_balance">Declining Balance</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="usefulLifeMonths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Useful Life (months) *</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Depreciation Preview Card */}
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Purchase Price</span>
                          <span className="font-mono">
                            {formatCurrency(form.watch('purchasePrice') || 0, 'AED', locale)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Residual Value</span>
                          <span className="font-mono">
                            {formatCurrency(form.watch('residualValue') || 0, 'AED', locale)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Depreciable Amount</span>
                          <span className="font-mono">
                            {formatCurrency(
                              Math.max(
                                0,
                                (form.watch('purchasePrice') || 0) -
                                  (form.watch('residualValue') || 0),
                              ),
                              'AED',
                              locale,
                            )}
                          </span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Monthly Depreciation (SL)</span>
                          <span className="font-mono">
                            {formatCurrency(
                              form.watch('usefulLifeMonths') > 0
                                ? Math.max(
                                    0,
                                    (form.watch('purchasePrice') || 0) -
                                      (form.watch('residualValue') || 0),
                                  ) / form.watch('usefulLifeMonths')
                                : 0,
                              'AED',
                              locale,
                            )}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Accounts & Notes Tab */}
                <TabsContent value="accounts" className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="assetAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset Account</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select asset account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {assetAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="depreciationExpenseAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Depreciation Expense Account</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select expense account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {expenseAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accumulatedDepAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accumulated Depreciation Account</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select contra-asset account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {assetAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional notes about this asset"
                            rows={4}
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {editingAsset ? 'Update Asset' : 'Add Asset'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
