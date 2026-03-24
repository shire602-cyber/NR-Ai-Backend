-- Migration 0022: Convert all monetary `real` columns to `numeric` for precision.
-- Each block is guarded by an IF EXISTS check so the migration is idempotent.

-- ============================================================
-- numeric(15,2) — monetary amounts
-- ============================================================

-- invoices: subtotal, vat_amount, total
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'subtotal' AND data_type = 'real') THEN
    ALTER TABLE invoices ALTER COLUMN subtotal TYPE numeric(15,2) USING subtotal::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'vat_amount' AND data_type = 'real') THEN
    ALTER TABLE invoices ALTER COLUMN vat_amount TYPE numeric(15,2) USING vat_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'total' AND data_type = 'real') THEN
    ALTER TABLE invoices ALTER COLUMN total TYPE numeric(15,2) USING total::numeric(15,2);
  END IF;
END $$;

-- invoice_lines: unit_price
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_lines' AND column_name = 'unit_price' AND data_type = 'real') THEN
    ALTER TABLE invoice_lines ALTER COLUMN unit_price TYPE numeric(15,2) USING unit_price::numeric(15,2);
  END IF;
END $$;

-- journal_lines: debit, credit
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_lines' AND column_name = 'debit' AND data_type = 'real') THEN
    ALTER TABLE journal_lines ALTER COLUMN debit TYPE numeric(15,2) USING debit::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_lines' AND column_name = 'credit' AND data_type = 'real') THEN
    ALTER TABLE journal_lines ALTER COLUMN credit TYPE numeric(15,2) USING credit::numeric(15,2);
  END IF;
END $$;

-- receipts: amount, vat_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'amount' AND data_type = 'real') THEN
    ALTER TABLE receipts ALTER COLUMN amount TYPE numeric(15,2) USING amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'vat_amount' AND data_type = 'real') THEN
    ALTER TABLE receipts ALTER COLUMN vat_amount TYPE numeric(15,2) USING vat_amount::numeric(15,2);
  END IF;
END $$;

-- bank_transactions: amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_transactions' AND column_name = 'amount' AND data_type = 'real') THEN
    ALTER TABLE bank_transactions ALTER COLUMN amount TYPE numeric(15,2) USING amount::numeric(15,2);
  END IF;
END $$;

-- budgets: budget_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'budget_amount' AND data_type = 'real') THEN
    ALTER TABLE budgets ALTER COLUMN budget_amount TYPE numeric(15,2) USING budget_amount::numeric(15,2);
  END IF;
END $$;

-- cash_flow_forecasts: predicted_inflow, predicted_outflow, predicted_balance
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow_forecasts' AND column_name = 'predicted_inflow' AND data_type = 'real') THEN
    ALTER TABLE cash_flow_forecasts ALTER COLUMN predicted_inflow TYPE numeric(15,2) USING predicted_inflow::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow_forecasts' AND column_name = 'predicted_outflow' AND data_type = 'real') THEN
    ALTER TABLE cash_flow_forecasts ALTER COLUMN predicted_outflow TYPE numeric(15,2) USING predicted_outflow::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow_forecasts' AND column_name = 'predicted_balance' AND data_type = 'real') THEN
    ALTER TABLE cash_flow_forecasts ALTER COLUMN predicted_balance TYPE numeric(15,2) USING predicted_balance::numeric(15,2);
  END IF;
END $$;

-- corporate_tax_returns: total_revenue, total_expenses, total_deductions, taxable_income, exemption_threshold, tax_payable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'total_revenue' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN total_revenue TYPE numeric(15,2) USING total_revenue::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'total_expenses' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN total_expenses TYPE numeric(15,2) USING total_expenses::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'total_deductions' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN total_deductions TYPE numeric(15,2) USING total_deductions::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'taxable_income' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN taxable_income TYPE numeric(15,2) USING taxable_income::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'exemption_threshold' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN exemption_threshold TYPE numeric(15,2) USING exemption_threshold::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'tax_payable' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN tax_payable TYPE numeric(15,2) USING tax_payable::numeric(15,2);
  END IF;
END $$;

-- ecommerce_transactions: amount, platform_fees, net_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecommerce_transactions' AND column_name = 'amount' AND data_type = 'real') THEN
    ALTER TABLE ecommerce_transactions ALTER COLUMN amount TYPE numeric(15,2) USING amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecommerce_transactions' AND column_name = 'platform_fees' AND data_type = 'real') THEN
    ALTER TABLE ecommerce_transactions ALTER COLUMN platform_fees TYPE numeric(15,2) USING platform_fees::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecommerce_transactions' AND column_name = 'net_amount' AND data_type = 'real') THEN
    ALTER TABLE ecommerce_transactions ALTER COLUMN net_amount TYPE numeric(15,2) USING net_amount::numeric(15,2);
  END IF;
END $$;

-- engagements: monthly_fee
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'engagements' AND column_name = 'monthly_fee' AND data_type = 'real') THEN
    ALTER TABLE engagements ALTER COLUMN monthly_fee TYPE numeric(15,2) USING monthly_fee::numeric(15,2);
  END IF;
END $$;

-- financial_kpis: value, previous_value
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_kpis' AND column_name = 'value' AND data_type = 'real') THEN
    ALTER TABLE financial_kpis ALTER COLUMN value TYPE numeric(15,2) USING value::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_kpis' AND column_name = 'previous_value' AND data_type = 'real') THEN
    ALTER TABLE financial_kpis ALTER COLUMN previous_value TYPE numeric(15,2) USING previous_value::numeric(15,2);
  END IF;
END $$;

-- products: unit_price, cost_price
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit_price' AND data_type = 'real') THEN
    ALTER TABLE products ALTER COLUMN unit_price TYPE numeric(15,2) USING unit_price::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cost_price' AND data_type = 'real') THEN
    ALTER TABLE products ALTER COLUMN cost_price TYPE numeric(15,2) USING cost_price::numeric(15,2);
  END IF;
END $$;

-- inventory_movements: unit_cost
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'unit_cost' AND data_type = 'real') THEN
    ALTER TABLE inventory_movements ALTER COLUMN unit_cost TYPE numeric(15,2) USING unit_cost::numeric(15,2);
  END IF;
END $$;

-- referral_codes: referrer_reward_value, referee_reward_value, total_rewards_earned
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referral_codes' AND column_name = 'referrer_reward_value' AND data_type = 'real') THEN
    ALTER TABLE referral_codes ALTER COLUMN referrer_reward_value TYPE numeric(15,2) USING referrer_reward_value::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referral_codes' AND column_name = 'referee_reward_value' AND data_type = 'real') THEN
    ALTER TABLE referral_codes ALTER COLUMN referee_reward_value TYPE numeric(15,2) USING referee_reward_value::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referral_codes' AND column_name = 'total_rewards_earned' AND data_type = 'real') THEN
    ALTER TABLE referral_codes ALTER COLUMN total_rewards_earned TYPE numeric(15,2) USING total_rewards_earned::numeric(15,2);
  END IF;
END $$;

-- referrals: referrer_reward_amount, referee_reward_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'referrer_reward_amount' AND data_type = 'real') THEN
    ALTER TABLE referrals ALTER COLUMN referrer_reward_amount TYPE numeric(15,2) USING referrer_reward_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'referee_reward_amount' AND data_type = 'real') THEN
    ALTER TABLE referrals ALTER COLUMN referee_reward_amount TYPE numeric(15,2) USING referee_reward_amount::numeric(15,2);
  END IF;
END $$;

-- service_invoices: subtotal, vat_amount, total, paid_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoices' AND column_name = 'subtotal' AND data_type = 'real') THEN
    ALTER TABLE service_invoices ALTER COLUMN subtotal TYPE numeric(15,2) USING subtotal::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoices' AND column_name = 'vat_amount' AND data_type = 'real') THEN
    ALTER TABLE service_invoices ALTER COLUMN vat_amount TYPE numeric(15,2) USING vat_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoices' AND column_name = 'total' AND data_type = 'real') THEN
    ALTER TABLE service_invoices ALTER COLUMN total TYPE numeric(15,2) USING total::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoices' AND column_name = 'paid_amount' AND data_type = 'real') THEN
    ALTER TABLE service_invoices ALTER COLUMN paid_amount TYPE numeric(15,2) USING paid_amount::numeric(15,2);
  END IF;
END $$;

-- service_invoice_lines: unit_price, amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoice_lines' AND column_name = 'unit_price' AND data_type = 'real') THEN
    ALTER TABLE service_invoice_lines ALTER COLUMN unit_price TYPE numeric(15,2) USING unit_price::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoice_lines' AND column_name = 'amount' AND data_type = 'real') THEN
    ALTER TABLE service_invoice_lines ALTER COLUMN amount TYPE numeric(15,2) USING amount::numeric(15,2);
  END IF;
END $$;

-- subscription_plans: price_monthly, price_yearly
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'price_monthly' AND data_type = 'real') THEN
    ALTER TABLE subscription_plans ALTER COLUMN price_monthly TYPE numeric(15,2) USING price_monthly::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'price_yearly' AND data_type = 'real') THEN
    ALTER TABLE subscription_plans ALTER COLUMN price_yearly TYPE numeric(15,2) USING price_yearly::numeric(15,2);
  END IF;
END $$;

-- tax_return_archive: tax_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tax_return_archive' AND column_name = 'tax_amount' AND data_type = 'real') THEN
    ALTER TABLE tax_return_archive ALTER COLUMN tax_amount TYPE numeric(15,2) USING tax_amount::numeric(15,2);
  END IF;
END $$;

-- vat_returns: all box fields, payment_amount, adjustment_amount
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1a_abu_dhabi_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1a_abu_dhabi_amount TYPE numeric(15,2) USING box1a_abu_dhabi_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1a_abu_dhabi_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1a_abu_dhabi_vat TYPE numeric(15,2) USING box1a_abu_dhabi_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1a_abu_dhabi_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1a_abu_dhabi_adj TYPE numeric(15,2) USING box1a_abu_dhabi_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1b_dubai_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1b_dubai_amount TYPE numeric(15,2) USING box1b_dubai_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1b_dubai_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1b_dubai_vat TYPE numeric(15,2) USING box1b_dubai_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1b_dubai_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1b_dubai_adj TYPE numeric(15,2) USING box1b_dubai_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1c_sharjah_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1c_sharjah_amount TYPE numeric(15,2) USING box1c_sharjah_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1c_sharjah_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1c_sharjah_vat TYPE numeric(15,2) USING box1c_sharjah_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1c_sharjah_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1c_sharjah_adj TYPE numeric(15,2) USING box1c_sharjah_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1d_ajman_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1d_ajman_amount TYPE numeric(15,2) USING box1d_ajman_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1d_ajman_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1d_ajman_vat TYPE numeric(15,2) USING box1d_ajman_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1d_ajman_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1d_ajman_adj TYPE numeric(15,2) USING box1d_ajman_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1e_umm_al_quwain_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1e_umm_al_quwain_amount TYPE numeric(15,2) USING box1e_umm_al_quwain_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1e_umm_al_quwain_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1e_umm_al_quwain_vat TYPE numeric(15,2) USING box1e_umm_al_quwain_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1e_umm_al_quwain_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1e_umm_al_quwain_adj TYPE numeric(15,2) USING box1e_umm_al_quwain_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1f_ras_al_khaimah_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1f_ras_al_khaimah_amount TYPE numeric(15,2) USING box1f_ras_al_khaimah_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1f_ras_al_khaimah_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1f_ras_al_khaimah_vat TYPE numeric(15,2) USING box1f_ras_al_khaimah_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1f_ras_al_khaimah_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1f_ras_al_khaimah_adj TYPE numeric(15,2) USING box1f_ras_al_khaimah_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1g_fujairah_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1g_fujairah_amount TYPE numeric(15,2) USING box1g_fujairah_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1g_fujairah_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1g_fujairah_vat TYPE numeric(15,2) USING box1g_fujairah_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1g_fujairah_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1g_fujairah_adj TYPE numeric(15,2) USING box1g_fujairah_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box2_tourist_refund_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box2_tourist_refund_amount TYPE numeric(15,2) USING box2_tourist_refund_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box2_tourist_refund_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box2_tourist_refund_vat TYPE numeric(15,2) USING box2_tourist_refund_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box3_reverse_charge_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box3_reverse_charge_amount TYPE numeric(15,2) USING box3_reverse_charge_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box3_reverse_charge_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box3_reverse_charge_vat TYPE numeric(15,2) USING box3_reverse_charge_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box4_zero_rated_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box4_zero_rated_amount TYPE numeric(15,2) USING box4_zero_rated_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box5_exempt_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box5_exempt_amount TYPE numeric(15,2) USING box5_exempt_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box6_imports_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box6_imports_amount TYPE numeric(15,2) USING box6_imports_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box6_imports_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box6_imports_vat TYPE numeric(15,2) USING box6_imports_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box7_imports_adj_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box7_imports_adj_amount TYPE numeric(15,2) USING box7_imports_adj_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box7_imports_adj_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box7_imports_adj_vat TYPE numeric(15,2) USING box7_imports_adj_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box8_total_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box8_total_amount TYPE numeric(15,2) USING box8_total_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box8_total_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box8_total_vat TYPE numeric(15,2) USING box8_total_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box8_total_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box8_total_adj TYPE numeric(15,2) USING box8_total_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box9_expenses_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box9_expenses_amount TYPE numeric(15,2) USING box9_expenses_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box9_expenses_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box9_expenses_vat TYPE numeric(15,2) USING box9_expenses_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box9_expenses_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box9_expenses_adj TYPE numeric(15,2) USING box9_expenses_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box10_reverse_charge_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box10_reverse_charge_amount TYPE numeric(15,2) USING box10_reverse_charge_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box10_reverse_charge_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box10_reverse_charge_vat TYPE numeric(15,2) USING box10_reverse_charge_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box11_total_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box11_total_amount TYPE numeric(15,2) USING box11_total_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box11_total_vat' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box11_total_vat TYPE numeric(15,2) USING box11_total_vat::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box11_total_adj' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box11_total_adj TYPE numeric(15,2) USING box11_total_adj::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box12_total_due_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box12_total_due_tax TYPE numeric(15,2) USING box12_total_due_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box13_recoverable_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box13_recoverable_tax TYPE numeric(15,2) USING box13_recoverable_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box14_payable_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box14_payable_tax TYPE numeric(15,2) USING box14_payable_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box1_sales_standard' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box1_sales_standard TYPE numeric(15,2) USING box1_sales_standard::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box2_sales_other_emirates' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box2_sales_other_emirates TYPE numeric(15,2) USING box2_sales_other_emirates::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box3_sales_tax_exempt' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box3_sales_tax_exempt TYPE numeric(15,2) USING box3_sales_tax_exempt::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box4_sales_exempt' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box4_sales_exempt TYPE numeric(15,2) USING box4_sales_exempt::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box5_total_output_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box5_total_output_tax TYPE numeric(15,2) USING box5_total_output_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box6_expenses_standard' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box6_expenses_standard TYPE numeric(15,2) USING box6_expenses_standard::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box7_expenses_tourist_refund' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box7_expenses_tourist_refund TYPE numeric(15,2) USING box7_expenses_tourist_refund::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box8_total_input_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box8_total_input_tax TYPE numeric(15,2) USING box8_total_input_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'box9_net_tax' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN box9_net_tax TYPE numeric(15,2) USING box9_net_tax::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'adjustment_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN adjustment_amount TYPE numeric(15,2) USING adjustment_amount::numeric(15,2);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vat_returns' AND column_name = 'payment_amount' AND data_type = 'real') THEN
    ALTER TABLE vat_returns ALTER COLUMN payment_amount TYPE numeric(15,2) USING payment_amount::numeric(15,2);
  END IF;
END $$;

-- ============================================================
-- numeric(15,4) — rates, quantities, percentages
-- ============================================================

-- invoice_lines: quantity, vat_rate
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_lines' AND column_name = 'quantity' AND data_type = 'real') THEN
    ALTER TABLE invoice_lines ALTER COLUMN quantity TYPE numeric(15,4) USING quantity::numeric(15,4);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_lines' AND column_name = 'vat_rate' AND data_type = 'real') THEN
    ALTER TABLE invoice_lines ALTER COLUMN vat_rate TYPE numeric(15,4) USING vat_rate::numeric(15,4);
  END IF;
END $$;

-- service_invoice_lines: quantity, vat_rate
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoice_lines' AND column_name = 'quantity' AND data_type = 'real') THEN
    ALTER TABLE service_invoice_lines ALTER COLUMN quantity TYPE numeric(15,4) USING quantity::numeric(15,4);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_invoice_lines' AND column_name = 'vat_rate' AND data_type = 'real') THEN
    ALTER TABLE service_invoice_lines ALTER COLUMN vat_rate TYPE numeric(15,4) USING vat_rate::numeric(15,4);
  END IF;
END $$;

-- products: vat_rate
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'vat_rate' AND data_type = 'real') THEN
    ALTER TABLE products ALTER COLUMN vat_rate TYPE numeric(15,4) USING vat_rate::numeric(15,4);
  END IF;
END $$;

-- financial_kpis: change_percent, benchmark
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_kpis' AND column_name = 'change_percent' AND data_type = 'real') THEN
    ALTER TABLE financial_kpis ALTER COLUMN change_percent TYPE numeric(15,4) USING change_percent::numeric(15,4);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_kpis' AND column_name = 'benchmark' AND data_type = 'real') THEN
    ALTER TABLE financial_kpis ALTER COLUMN benchmark TYPE numeric(15,4) USING benchmark::numeric(15,4);
  END IF;
END $$;

-- corporate_tax_returns: tax_rate
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_tax_returns' AND column_name = 'tax_rate' AND data_type = 'real') THEN
    ALTER TABLE corporate_tax_returns ALTER COLUMN tax_rate TYPE numeric(15,4) USING tax_rate::numeric(15,4);
  END IF;
END $$;
