export interface AssistantToolResult { tool: string; args: Record<string, unknown>; result: unknown; }

const label = (value: string) => value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const scalar = (value: unknown): string | number | boolean => {
  if (value == null) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return value as string | number | boolean;
  return JSON.stringify(value);
};
const summary = (result: unknown): Record<string, unknown>[] => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [{ valor: result }];
  return Object.entries(result as Record<string, unknown>).filter(([, v]) => !Array.isArray(v) && (v == null || typeof v !== 'object')).map(([indicador, valor]) => ({ indicador: label(indicador), valor }));
};
const tables = (result: unknown): Array<{ name: string; rows: Record<string, unknown>[] }> => {
  if (Array.isArray(result)) return [{ name: 'Detalle', rows: result }];
  if (!result || typeof result !== 'object') return [];
  return Object.entries(result as Record<string, unknown>).filter(([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object').map(([name, rows]) => ({ name: label(name), rows: rows as Record<string, unknown>[] }));
};
const safeName = (name: string) => name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);

export async function exportAssistantExcel(item: AssistantToolResult): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Asistente Torre de Control';
  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const sheet = workbook.addWorksheet(name.slice(0, 31));
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    sheet.columns = columns.map(key => ({ header: label(key), key, width: 22 }));
    rows.forEach(row => sheet.addRow(Object.fromEntries(columns.map(key => [key, scalar(row[key])]))));
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };
  addSheet('Resumen', summary(item.result));
  tables(item.result).forEach((table, i) => addSheet(`${i + 1}-${table.name}`, table.rows));
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${safeName(item.tool)}_${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click();
  URL.revokeObjectURL(url);
}

const escapeHtml = (value: unknown) => String(scalar(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function printAssistantReport(item: AssistantToolResult): void {
  const renderTable = (title: string, rows: Record<string, unknown>[]) => {
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${columns.map(c => `<th>${escapeHtml(label(c))}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  const sections = tables(item.result).map(t => renderTable(t.name, t.rows)).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(item.tool)}</title><style>@page{size:A4;margin:16mm}body{font:12px Arial;color:#172033}h1{color:#312e81}h2{margin-top:22px;color:#4338ca}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#4338ca;color:white}tr:nth-child(even){background:#f8fafc}.meta{color:#64748b}</style></head><body><h1>Informe - Torre de Control</h1><p class="meta">Generado ${new Date().toLocaleString('es-CO')} | Consulta: ${escapeHtml(item.tool)}</p>${renderTable('Resumen ejecutivo', summary(item.result))}${sections}<script>window.onload=()=>window.print()</script></body></html>`;
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('El navegador bloqueó la ventana de impresión.');
  popup.document.write(html); popup.document.close();
}
