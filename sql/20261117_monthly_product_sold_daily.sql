-- Daily SKU-level monthly sales quantities; one source row per date, selling location, SKU.
-- The selected active group expands into its member SKUs, and is never itself double-counted.
-- Existing Monthly Sales totals and stock/COGS are not modified.
create or replace function public.bb_report_monthly_product_sold_daily(
  p_year integer, p_month integer, p_product_code text
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_start date;
  v_end date;
  v_sku text;
  v_group text;
  v_rows jsonb;
begin
  if not public.bb_is_active_user() then
    raise exception 'BIG BROTHER access denied';
  end if;
  if not public.bb_is_admin()
     and not public.bb_has_module_access('daily_sale_summary','view')
     and not public.bb_has_module_access('invoice_history','view') then
    raise exception 'Monthly Sales Report access denied';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2200
     or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Valid report year and month are required';
  end if;
  v_sku := nullif(trim(coalesce(p_product_code,'')),'');
  if v_sku is null or length(v_sku)>100 then
    raise exception 'A valid product SKU is required';
  end if;
  v_start := make_date(p_year,p_month,1);
  v_end := (v_start + interval '1 month')::date;

  -- Treat the requested code as a group only when that group is active.
  select g.group_code into v_group
  from public.product_groups g
  where lower(trim(g.group_code))=lower(v_sku)
    and coalesce(g.active,false)
  limit 1;

  with target_codes as (
    select lower(v_sku) as code
    union
    select lower(trim(m.product_code)) as code
    from public.product_group_mapping m
    where v_group is not null and m.group_code=v_group
      and coalesce(m.use_group,false)
      and lower(trim(coalesce(m.status,'')))='active'
  ),
  sales as (
    select i.invoice_date as report_date,
      coalesce(nullif(trim(i.location_code),''),'UNASSIGNED') as location_code,
      coalesce(l.location_name,nullif(trim(i.location_code),''),'Unassigned') as location_name,
      coalesce(nullif(trim(il.product_code),''),nullif(trim(il.display_product_code),''),'UNASSIGNED') as product_code,
      coalesce(nullif(trim(il.product_name_snapshot),''),il.product_code,'Unassigned Product') as product_name,
      coalesce(nullif(trim(il.unit_snapshot),''),'') as unit,
      coalesce(il.qty,0)::numeric as gross_qty,
      0::numeric as return_qty,
      case when upper(trim(coalesce(i.currency,'USD')))='USD'
        then case when coalesce(i.subtotal,0)<>0
          then coalesce(il.line_total,0)*coalesce(i.grand_total,0)/i.subtotal else 0 end
        else case when coalesce(i.exchange_rate,0)>0 and coalesce(i.subtotal,0)<>0
          then (coalesce(il.line_total,0)*coalesce(i.grand_total,0)/i.subtotal)/i.exchange_rate else 0 end
      end::numeric as gross_sales_usd,
      0::numeric as returns_usd
    from public.invoices i
    join public.invoice_lines il on il.invoice_id=i.invoice_id
    left join public.locations l on l.location_code=i.location_code
    where i.invoice_date>=v_start and i.invoice_date<v_end
      and i.invoice_id not like 'AR-MIG-%'
      and upper(trim(coalesce(i.status,''))) not in ('VOID','CANCELLED','CANCELED','REVERSED')
      and (public.bb_is_admin() or public.bb_has_location_access(i.location_code))
      and lower(coalesce(nullif(trim(il.product_code),''),nullif(trim(il.display_product_code),''),'UNASSIGNED'))
          in (select code from target_codes)
  ),
  returns as (
    select sr.return_date as report_date,
      coalesce(nullif(trim(sr.location_code),''),nullif(trim(i.location_code),''),'UNASSIGNED') as location_code,
      coalesce(l.location_name,nullif(trim(sr.location_code),''),nullif(trim(i.location_code),''),'Unassigned') as location_name,
      coalesce(nullif(trim(sr.product_code),''),'UNASSIGNED') as product_code,
      coalesce(nullif(trim(sr.product_name_snapshot),''),sr.product_code,'Unassigned Product') as product_name,
      coalesce(p.unit,'') as unit,
      0::numeric as gross_qty,
      coalesce(sr.qty,0)::numeric as return_qty,
      0::numeric as gross_sales_usd,
      case when upper(trim(coalesce(i.currency,'USD')))='USD' then coalesce(sr.return_amount,0)
        when coalesce(i.exchange_rate,0)>0 then coalesce(sr.return_amount,0)/i.exchange_rate
        else 0 end::numeric as returns_usd
    from public.sales_returns sr
    left join public.invoices i on i.invoice_id=sr.invoice_id
    left join public.locations l on l.location_code=coalesce(nullif(trim(sr.location_code),''),i.location_code)
    left join public.products p on p.product_code=sr.product_code
    where sr.return_date>=v_start and sr.return_date<v_end
      and (i.invoice_id is null or i.invoice_id not like 'AR-MIG-%')
      and (public.bb_is_admin() or public.bb_has_location_access(coalesce(nullif(trim(sr.location_code),''),i.location_code)))
      and lower(coalesce(nullif(trim(sr.product_code),''),'UNASSIGNED')) in (select code from target_codes)
  ),
  combined as (
    select * from sales
    union all
    select * from returns
  ),
  daily as (
    select report_date, location_code, max(location_name) as location_name,
      product_code, max(product_name) as product_name, max(unit) as unit,
      sum(gross_qty) as gross_qty,
      sum(return_qty) as return_qty,
      sum(gross_sales_usd) as gross_sales_usd,
      sum(returns_usd) as returns_usd
    from combined
    group by report_date,location_code,product_code
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',d.report_date::text, 'locationCode',d.location_code,
    'locationName',d.location_name,'productCode',d.product_code,
    'productName',d.product_name,'unit',d.unit,
    'grossQty',round(d.gross_qty,6),'returnQty',round(d.return_qty,6),
    'netQty',round(d.gross_qty-d.return_qty,6),
    'grossSalesUSD',round(d.gross_sales_usd,2),
    'returnsUSD',round(d.returns_usd,2),
    'totalSaleUSD',round(d.gross_sales_usd-d.returns_usd,2)
  ) order by d.report_date,d.location_name,d.location_code,d.product_code),'[]'::jsonb)
  into v_rows
  from daily d;

  return jsonb_build_object(
    'periodLabel',to_char(v_start,'FMMonth YYYY'),
    'productCode',v_sku,'groupCode',v_group,
    'dateRule','SALES_ON_INVOICE_DATE_RETURNS_ON_RETURN_DATE',
    'rows',v_rows
  );
end;
$function$;

revoke all on function public.bb_report_monthly_product_sold_daily(integer,integer,text) from public, anon;
grant execute on function public.bb_report_monthly_product_sold_daily(integer,integer,text) to authenticated;