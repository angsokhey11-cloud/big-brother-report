# BIG BROTHER Main Reports

Live monthly reporting workspace for BIG BROTHER Accounting Systems.

## Reports

- `monthly-sales.html` — Monthly Sales Report by Location and SKU.
- `income-statement.html` — Monthly Income Statement in USD.
- `purchase-order-report.html` — Monthly Purchase Order Report by Client/Supplier.
- `index.html` — Main Report hub.

## Monthly Sales accounting rule

Total Sale USD uses valid invoice grand totals and subtracts sales returns. USD invoices remain USD. Non-USD/KHR invoices are converted using the exchange rate saved on the original invoice: `Sale USD = Native Amount / Invoice Exchange Rate`.

The location and SKU breakdown reconciles to the monthly grand total.

## Income Statement rule

Net Sales = Gross Sales - Sales Returns.
Gross Profit = Net Sales - COGS.
Operating Profit = Gross Profit - Operating Expense.
Net Profit = Operating Profit - Non-Operating Expense.
Capital Expense is shown separately and is not included in Net Profit.

## Authentication

Reports use the shared BIG BROTHER Dashboard Supabase session stored under `BB_SUPABASE_DEV_SESSION_V1`. Backend RPCs enforce active-user and module/admin access rules.