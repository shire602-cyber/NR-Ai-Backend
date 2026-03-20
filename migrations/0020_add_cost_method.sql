-- Migration 0020: Add cost_method to companies and total_cost to inventory_movements
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cost_method TEXT DEFAULT 'weighted_average';
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2);
