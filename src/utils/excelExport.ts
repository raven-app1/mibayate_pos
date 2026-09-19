import * as XLSX from 'xlsx';
import { SaleWithItems } from '../types';

function autoFitColumns(data: (string | number | boolean | null | undefined)[][]): { wch: number }[] {
  const colWidths: number[] = [];
  data.forEach((row) => {
    row.forEach((val, colIdx) => {
      const str = val === null || val === undefined ? '' : String(val);
      const len = str.length;
      colWidths[colIdx] = Math.max(colWidths[colIdx] || 10, len + 3);
    });
  });
  return colWidths.map((wch) => ({ wch: Math.min(Math.max(wch, 12), 50) }));
}

export function generateSalesReportWorkbook(sales: SaleWithItems[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const totalTransactions = sales.length;
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const totalDiscount = sales.reduce((sum, s) => sum + (s.discount || 0), 0);
  const totalItemsSold = sales.reduce((sum, s) => {
    const itemsQty = (s.items || []).reduce((itemSum, it) => itemSum + (it.quantity || 0), 0);
    return sum + itemsQty;
  }, 0);

  const cashSalesTotal = sales
    .filter((s) => s.payment_method === 'cash')
    .reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const cardSalesTotal = sales
    .filter((s) => s.payment_method === 'card')
    .reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const mobileSalesTotal = sales
    .filter((s) => ['mobile', 'kbzpay', 'ayapay', 'wavepay', 'other'].includes(s.payment_method))
    .reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const summaryRows: (string | number)[][] = [
    ['Sales Report Summary', ''],
    ['Generated At', new Date().toLocaleString()],
    ['', ''],
    ['Metric', 'Value'],
    ['Total Transactions', totalTransactions],
    ['Total Items Sold', totalItemsSold],
    ['Total Discount (Ks)', totalDiscount],
    ['Total Sales Amount (Ks)', totalRevenue],
    ['', ''],
    ['Payment Method Breakdown', 'Amount (Ks)'],
    ['Cash', cashSalesTotal],
    ['Card', cardSalesTotal],
    ['Mobile Payment', mobileSalesTotal]
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = autoFitColumns(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const salesHeaders = [
    'Sale ID',
    'Date',
    'Time',
    'Branch',
    'Cashier',
    'Customer Name',
    'Customer Phone',
    'Payment Method',
    'Items Count',
    'Total Units Sold',
    'Discount (Ks)',
    'Total Amount (Ks)'
  ];

  const salesDataRows: (string | number)[][] = sales.map((s) => {
    const d = new Date(s.created_at);
    const dateStr = isNaN(d.getTime()) ? s.created_at : d.toLocaleDateString();
    const timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
    const itemsCount = s.items?.length || 0;
    const unitsSold = (s.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);

    return [
      s.id,
      dateStr,
      timeStr,
      s.branch_name || 'Main',
      s.cashier_name || '-',
      s.customer_name || '-',
      s.customer_phone || '-',
      (s.payment_method || '').toUpperCase(),
      itemsCount,
      unitsSold,
      s.discount || 0,
      s.total_amount || 0
    ];
  });

  const salesRows = [salesHeaders, ...salesDataRows];
  const salesSheet = XLSX.utils.aoa_to_sheet(salesRows);
  salesSheet['!cols'] = autoFitColumns(salesRows);
  XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales Transactions');

  const itemsHeaders = [
    'Sale ID',
    'Date',
    'Time',
    'Branch',
    'Cashier',
    'Customer Name',
    'Product ID',
    'Product Name',
    'Quantity',
    'Unit Price (Ks)',
    'Unit Cost (Ks)',
    'Subtotal (Ks)',
    'Payment Method'
  ];

  const itemsDataRows: (string | number)[][] = [];
  sales.forEach((s) => {
    const d = new Date(s.created_at);
    const dateStr = isNaN(d.getTime()) ? s.created_at : d.toLocaleDateString();
    const timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString();

    if (s.items && s.items.length > 0) {
      s.items.forEach((it) => {
        itemsDataRows.push([
          s.id,
          dateStr,
          timeStr,
          s.branch_name || 'Main',
          s.cashier_name || '-',
          s.customer_name || '-',
          it.product_id || '-',
          it.product_name,
          it.quantity || 0,
          it.unit_price || 0,
          it.unit_cost || 0,
          it.total || 0,
          (s.payment_method || '').toUpperCase()
        ]);
      });
    }
  });

  const itemsRows = [itemsHeaders, ...itemsDataRows];
  const itemsSheet = XLSX.utils.aoa_to_sheet(itemsRows);
  itemsSheet['!cols'] = autoFitColumns(itemsRows);
  XLSX.utils.book_append_sheet(wb, itemsSheet, 'Sale Items Detail');

  return wb;
}

export interface MonthlyProfitExportData {
  monthKey: string;
  monthLabel: string;
  ordersCount: number;
  itemsCount: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export function exportMonthlyProfitToXlsx(
  months: MonthlyProfitExportData[],
  rangeLabel: string = 'All Months',
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  const totalOrders = months.reduce((sum, m) => sum + m.ordersCount, 0);
  const totalItems = months.reduce((sum, m) => sum + m.itemsCount, 0);
  const totalRevenue = months.reduce((sum, m) => sum + m.revenue, 0);
  const totalCost = months.reduce((sum, m) => sum + m.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const summaryRows: (string | number)[][] = [
    ['Monthly Profit Report', ''],
    ['Generated At', new Date().toLocaleString()],
    ['Selected Period', rangeLabel],
    ['', ''],
    ['Metric', 'Value'],
    ['Total Months', months.length],
    ['Total Orders', totalOrders],
    ['Total Items Sold', totalItems],
    ['Total Revenue (Ks)', totalRevenue],
    ['Total Cost of Goods (Ks)', totalCost],
    ['Gross Profit (Ks)', totalProfit],
    ['Profit Margin (%)', `${overallMargin.toFixed(2)}%`]
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = autoFitColumns(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const detailHeaders = [
    'Month',
    'Orders Count',
    'Items Sold',
    'Revenue (Ks)',
    'Cost (Ks)',
    'Gross Profit (Ks)',
    'Margin (%)'
  ];

  const detailDataRows = months.map((m) => [
    m.monthLabel,
    m.ordersCount,
    m.itemsCount,
    m.revenue,
    m.cost,
    m.profit,
    `${m.marginPercent.toFixed(2)}%`
  ]);

  const detailRows = [detailHeaders, ...detailDataRows];
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  detailSheet['!cols'] = autoFitColumns(detailRows);
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Monthly Profit');

  const finalFilename = filename || `monthly_profit_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', finalFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSalesReportToXlsx(sales: SaleWithItems[], filename?: string): void {
  const wb = generateSalesReportWorkbook(sales);
  const finalFilename = filename || `sale_report_${new Date().toISOString().slice(0, 10)}.xlsx`;

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', finalFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
