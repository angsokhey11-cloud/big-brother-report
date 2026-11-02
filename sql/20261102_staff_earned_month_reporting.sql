-- BIG BROTHER | Staff earnings reporting period correction | 02-Nov-2026
-- Source: verified active cloud function private.bb_reporting_expenses_v2()
-- Recognition of DRIVER_ALLOWANCE follows the related batch/source month.
-- Recognition of SPECIAL_ALLOWANCE follows salary_month (fallback: source_date).
-- Actual paid expense records, payment date, payout/RPC logic and cash remain unchanged.
-- Use with the approved Local Brain SQL deployment mechanism; Code Sync alone does not execute database SQL.
-- Replaces only one existing reporting function. No table data updates.

CREATE OR REPLACE FUNCTION private.bb_reporting_expenses_v2()
 RETURNS SETOF expenses
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select x.*
  from public.expenses x
  where not exists (
    select 1 from public.staff_payment_earnings se
    where se.expense_id=x.expense_id
      and se.status='PAID'
      and (
        (se.earning_type='MONTHLY_SALARY' and se.salary_month is not null)
        or (se.earning_type in ('SALES_INCENTIVE','DRIVER_ALLOWANCE','SPECIAL_ALLOWANCE')
         and (case when se.earning_type='SPECIAL_ALLOWANCE' then coalesce(se.salary_month,se.source_date) else se.source_date end) is not null
         and se.expense_recognition_timing='ON_PAYMENT')
      )
  )
  union all
  select (pg_catalog.jsonb_populate_record(
    x,
    pg_catalog.jsonb_build_object(
      'expense_id', 'EARNING-PERIOD-' || se.earning_id::text,
      'expense_date', (date_trunc('month',case when se.earning_type='MONTHLY_SALARY' then se.salary_month when se.earning_type='SPECIAL_ALLOWANCE' then coalesce(se.salary_month,se.source_date) else coalesce((select b.batch_date from public.stock_batches b where b.batch_id=se.batch_id),se.source_date) end)::date + interval '1 month - 1 day')::date,
      'description', coalesce(x.description,'Staff Expense') || ' [Earning period: ' || to_char(case when se.earning_type='MONTHLY_SALARY' then se.salary_month when se.earning_type='SPECIAL_ALLOWANCE' then coalesce(se.salary_month,se.source_date) else coalesce((select b.batch_date from public.stock_batches b where b.batch_id=se.batch_id),se.source_date) end,'Mon YYYY') || ']',
      'amount', round(coalesce(x.amount,0) * (se.gross_amount / nullif(split.total_gross,0)),2),
      'amount_usd', round(coalesce(x.amount_usd,0) * (se.gross_amount / nullif(split.total_gross,0)),2)
    )
  )).*
  from public.staff_payment_earnings se
  join public.expenses x on x.expense_id=se.expense_id
  join lateral (
    select sum(s2.gross_amount) total_gross
    from public.staff_payment_earnings s2
    where s2.expense_id=se.expense_id
      and s2.status='PAID'
      and s2.earning_type=se.earning_type
  ) split on true
  where se.status='PAID' and se.expense_id is not null
    and (
      (se.earning_type='MONTHLY_SALARY' and se.salary_month is not null)
      or (se.earning_type in ('SALES_INCENTIVE','DRIVER_ALLOWANCE','SPECIAL_ALLOWANCE')
         and (case when se.earning_type='SPECIAL_ALLOWANCE' then coalesce(se.salary_month,se.source_date) else se.source_date end) is not null
         and se.expense_recognition_timing='ON_PAYMENT')
    )
    and split.total_gross>0;
$function$

