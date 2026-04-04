import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { requireFeature } from '../middleware/featureGate';
import { storage } from '../storage';
import { generateDepreciationSchedule, postDepreciationEntry, postPendingDepreciation, disposeAsset } from '../services/depreciation.service';

export function registerFixedAssetRoutes(app: Express) {
  // =====================================
  // Fixed Asset Category Routes
  // =====================================

  // Customer-only: List asset categories by company
  app.get('/api/companies/:companyId/fixed-asset-categories', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const categories = await storage.getFixedAssetCategoriesByCompanyId(companyId);
      res.json(categories);
    }));

  // Customer-only: Create asset category
  app.post('/api/companies/:companyId/fixed-asset-categories', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const category = await storage.createFixedAssetCategory({ ...req.body, companyId });
      console.log('[FixedAssets] Category created:', category.id);
      res.status(201).json(category);
    }));

  // Customer-only: Update asset category
  app.put('/api/fixed-asset-categories/:id', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const category = await storage.getFixedAssetCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Asset category not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, category.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const updated = await storage.updateFixedAssetCategory(id, req.body);
      res.json(updated);
    }));

  // Customer-only: Delete asset category
  app.delete('/api/fixed-asset-categories/:id', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const category = await storage.getFixedAssetCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Asset category not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, category.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await storage.deleteFixedAssetCategory(id);
      res.json({ message: 'Asset category deleted' });
    }));

  // =====================================
  // Fixed Asset Routes
  // =====================================

  // Customer-only: List fixed assets by company
  app.get('/api/companies/:companyId/fixed-assets', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const assets = await storage.getFixedAssetsByCompanyId(companyId);
      res.json(assets);
    }));

  // Customer-only: Get single fixed asset with depreciation schedules
  app.get('/api/fixed-assets/:id', authMiddleware, requireCustomer, requireFeature('fixedAssets'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const schedules = await storage.getDepreciationSchedulesByAssetId(id);
      res.json({ ...asset, depreciationSchedules: schedules });
    }));

  // Customer-only: Create fixed asset with auto-generated depreciation schedule
  app.post('/api/companies/:companyId/fixed-assets', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const asset = await storage.createFixedAsset({ ...req.body, companyId });

      // Auto-generate depreciation schedule
      await generateDepreciationSchedule(asset.id);

      const schedules = await storage.getDepreciationSchedulesByAssetId(asset.id);
      console.log('[FixedAssets] Asset created with depreciation schedule:', asset.id);
      res.status(201).json({ ...asset, depreciationSchedules: schedules });
    }));

  // Customer-only: Update fixed asset (only if no posted depreciation)
  app.put('/api/fixed-assets/:id', authMiddleware, requireCustomer, requireFeature('fixedAssets'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const schedules = await storage.getDepreciationSchedulesByAssetId(id);
      const hasPosted = schedules.some((s: any) => s.status === 'posted');
      if (hasPosted) {
        return res.status(400).json({ message: 'Cannot update asset with posted depreciation entries' });
      }

      const updated = await storage.updateFixedAsset(id, req.body);
      res.json(updated);
    }));

  // Customer-only: Delete fixed asset (only if no posted depreciation)
  app.delete('/api/fixed-assets/:id', authMiddleware, requireCustomer, requireFeature('fixedAssets'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const schedules = await storage.getDepreciationSchedulesByAssetId(id);
      const hasPosted = schedules.some((s: any) => s.status === 'posted');
      if (hasPosted) {
        return res.status(400).json({ message: 'Cannot delete asset with posted depreciation entries' });
      }

      await storage.deleteFixedAsset(id);
      res.json({ message: 'Fixed asset deleted' });
    }));

  // =====================================
  // Depreciation Routes
  // =====================================

  // Customer-only: Regenerate depreciation schedule for an asset
  app.post('/api/fixed-assets/:id/generate-schedule', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await generateDepreciationSchedule(asset.id);

      const schedules = await storage.getDepreciationSchedulesByAssetId(id);
      console.log('[FixedAssets] Depreciation schedule regenerated for asset:', id);
      res.json({ ...asset, depreciationSchedules: schedules });
    }));

  // Customer-only: Post a single depreciation entry
  app.post('/api/fixed-assets/:id/depreciation/:scheduleId/post', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { id, scheduleId } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const result = await postDepreciationEntry(scheduleId, userId);
      console.log('[FixedAssets] Depreciation entry posted:', scheduleId, 'for asset:', id);
      res.json(result);
    }));

  // Customer-only: Batch post all pending depreciation through a date
  app.post('/api/companies/:companyId/depreciation/batch-post', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;
      const { throughDate } = req.body;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!throughDate) {
        return res.status(400).json({ message: 'throughDate is required' });
      }

      const result = await postPendingDepreciation(companyId, new Date(throughDate), userId);
      console.log('[FixedAssets] Batch depreciation posted for company:', companyId, 'through:', throughDate);
      res.json(result);
    }));

  // Customer-only: Depreciation summary report
  app.get('/api/companies/:companyId/depreciation/summary', authMiddleware, requireCustomer,
    requireFeature('fixedAssets'), asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const assets = await storage.getFixedAssetsByCompanyId(companyId);
      const activeAssets = assets.filter((a: any) => a.status === 'active');

      let totalAssetValue = 0;
      let totalAccumulatedDepreciation = 0;
      let totalBookValue = 0;

      for (const asset of activeAssets) {
        const schedules = await storage.getDepreciationSchedulesByAssetId(asset.id);
        const postedSchedules = schedules.filter((s: any) => s.status === 'posted');
        const accumulatedDepreciation = postedSchedules.reduce((sum: number, s: any) => sum + Number(s.depreciationAmount || 0), 0);

        const assetCost = Number(asset.purchasePrice || 0);
        totalAssetValue += assetCost;
        totalAccumulatedDepreciation += accumulatedDepreciation;
        totalBookValue += assetCost - accumulatedDepreciation;
      }

      res.json({
        totalAssets: activeAssets.length,
        totalAssetValue,
        totalAccumulatedDepreciation,
        totalBookValue,
        assets: activeAssets.map((a: any) => ({
          id: a.id,
          name: a.name,
          purchasePrice: Number(a.purchasePrice || 0),
        })),
      });
    }));

  // =====================================
  // Disposal Routes
  // =====================================

  // Customer-only: Dispose of a fixed asset
  app.post('/api/fixed-assets/:id/dispose', authMiddleware, requireCustomer, requireFeature('fixedAssets'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const asset = await storage.getFixedAsset(id);
      if (!asset) {
        return res.status(404).json({ message: 'Fixed asset not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, asset.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (asset.status === 'disposed') {
        return res.status(400).json({ message: 'Asset already disposed' });
      }

      const { disposalDate, disposalPrice } = req.body;
      if (!disposalDate) {
        return res.status(400).json({ message: 'Disposal date is required' });
      }
      await disposeAsset(id, new Date(disposalDate), Number(disposalPrice || 0), userId);
      const updatedAsset = await storage.getFixedAsset(id);
      console.log('[FixedAssets] Asset disposed:', id);
      res.json(updatedAsset);
    }));
}
