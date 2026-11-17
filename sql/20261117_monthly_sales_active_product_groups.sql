-- Read-only monthly sales product-family metadata.
-- Uses the same access gate as bb_report_monthly_sales; never changes sales or stock.
create or replace function public.bb_report_monthly_sales_product_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.bb_is_active_user() then
    raise exception 'BIG BROTHER access denied';
  end if;
  if not public.bb_is_admin()
     and not public.bb_has_module_access('daily_sale_summary','view')
     and not public.bb_has_module_access('invoice_history','view') then
    raise exception 'Monthly Sales Report access denied';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'groupCode', g.group_code,
        'groupName', g.group_name,
        'memberCodes', coalesce((
          select jsonb_agg(m.product_code order by m.product_code)
          from public.product_group_mapping m
          where m.group_code = g.group_code
            and coalesce(m.use_group,false)
            and lower(trim(coalesce(m.status,''))) = 'active'
        ), '[]'::jsonb)
      ) order by g.group_name,g.group_code
    )
    from public.product_groups g
    where coalesce(g.active,false)
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.bb_report_monthly_sales_product_groups() from public, anon;
grant execute on function public.bb_report_monthly_sales_product_groups() to authenticated;
