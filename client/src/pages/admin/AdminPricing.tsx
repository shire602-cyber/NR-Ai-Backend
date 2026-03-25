import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Plus, Trash2, Edit2, Save, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { SubscriptionPlan } from '@shared/schema';

interface AdminPricingProps {
  plans: SubscriptionPlan[];
  plansLoading: boolean;
}

function PlanForm({
  initialData,
  onSubmit,
  isPending
}: {
  initialData?: SubscriptionPlan;
  onSubmit: (data: Partial<SubscriptionPlan>) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>(initialData || {
    name: '',
    description: '',
    priceMonthly: '0',
    priceYearly: '0',
    currency: 'AED',
    maxCompanies: 1,
    maxUsers: 1,
    aiCreditsPerMonth: 100,
    hasWhatsappIntegration: false,
    hasAdvancedReports: false,
    hasApiAccess: false,
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Plan Name</Label>
          <Input
            id="name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-plan-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={formData.currency}
            onValueChange={(value) => setFormData({ ...formData, currency: value })}
          >
            <SelectTrigger data-testid="select-plan-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AED">AED</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          data-testid="input-plan-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priceMonthly">Monthly Price</Label>
          <Input
            id="priceMonthly"
            type="number"
            value={formData.priceMonthly || 0}
            onChange={(e) => setFormData({ ...formData, priceMonthly: e.target.value })}
            required
            data-testid="input-price-monthly"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priceYearly">Yearly Price</Label>
          <Input
            id="priceYearly"
            type="number"
            value={formData.priceYearly || 0}
            onChange={(e) => setFormData({ ...formData, priceYearly: e.target.value })}
            data-testid="input-price-yearly"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxCompanies">Max Companies</Label>
          <Input
            id="maxCompanies"
            type="number"
            value={formData.maxCompanies || 1}
            onChange={(e) => setFormData({ ...formData, maxCompanies: parseInt(e.target.value) })}
            data-testid="input-max-companies"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxUsers">Max Users</Label>
          <Input
            id="maxUsers"
            type="number"
            value={formData.maxUsers || 1}
            onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) })}
            data-testid="input-max-users"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aiCredits">AI Credits/Month</Label>
          <Input
            id="aiCredits"
            type="number"
            value={formData.aiCreditsPerMonth || 100}
            onChange={(e) => setFormData({ ...formData, aiCreditsPerMonth: parseInt(e.target.value) })}
            data-testid="input-ai-credits"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>WhatsApp Integration</Label>
          <Switch
            checked={formData.hasWhatsappIntegration || false}
            onCheckedChange={(checked) => setFormData({ ...formData, hasWhatsappIntegration: checked })}
            data-testid="switch-plan-whatsapp"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>Advanced Reports</Label>
          <Switch
            checked={formData.hasAdvancedReports || false}
            onCheckedChange={(checked) => setFormData({ ...formData, hasAdvancedReports: checked })}
            data-testid="switch-plan-reports"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>API Access</Label>
          <Switch
            checked={formData.hasApiAccess || false}
            onCheckedChange={(checked) => setFormData({ ...formData, hasApiAccess: checked })}
            data-testid="switch-plan-api"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch
            checked={formData.isActive !== false}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            data-testid="switch-plan-active"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending} data-testid="button-save-plan">
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Plan
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AdminPricing({ plans, plansLoading }: AdminPricingProps) {
  const { toast } = useToast();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [newPlanDialogOpen, setNewPlanDialogOpen] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);

  const createPlanMutation = useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan>) => {
      return apiRequest('POST', '/api/admin/plans', plan);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({ title: 'Plan created successfully' });
      setNewPlanDialogOpen(false);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to create plan' });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan> & { id: string }) => {
      return apiRequest('PUT', `/api/admin/plans/${plan.id}`, plan);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({ title: 'Plan updated successfully' });
      setEditingPlan(null);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to update plan' });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({ title: 'Plan deleted successfully' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to delete plan' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Subscription Plans</h2>
        <Dialog open={newPlanDialogOpen} onOpenChange={setNewPlanDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-plan">
              <Plus className="w-4 h-4 mr-2" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Plan</DialogTitle>
              <DialogDescription>Add a new subscription plan for your customers</DialogDescription>
            </DialogHeader>
            <PlanForm
              onSubmit={(data) => createPlanMutation.mutate(data)}
              isPending={createPlanMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plansLoading ? (
          <div className="col-span-full flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              No subscription plans configured. Add your first plan to get started.
            </CardContent>
          </Card>
        ) : (
          plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-4">
                  {plan.currency} {plan.priceMonthly}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Companies</span>
                    <span>{plan.maxCompanies || 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Users</span>
                    <span>{plan.maxUsers || 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI Credits/Month</span>
                    <span>{plan.aiCreditsPerMonth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WhatsApp Integration</span>
                    <span>{plan.hasWhatsappIntegration ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditingPlan(plan)}
                  data-testid={`button-edit-plan-${plan.id}`}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletePlanId(plan.id)}
                  data-testid={`button-delete-plan-${plan.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>Modify subscription plan details</DialogDescription>
          </DialogHeader>
          {editingPlan && (
            <PlanForm
              initialData={editingPlan}
              onSubmit={(data) => updatePlanMutation.mutate({ ...data, id: editingPlan.id })}
              isPending={updatePlanMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Plan Confirmation */}
      <ConfirmDialog
        open={!!deletePlanId}
        onOpenChange={(open) => { if (!open) setDeletePlanId(null); }}
        title="Delete Plan"
        description="Are you sure you want to delete this subscription plan? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deletePlanId) {
            deletePlanMutation.mutate(deletePlanId);
            setDeletePlanId(null);
          }
        }}
      />
    </div>
  );
}
