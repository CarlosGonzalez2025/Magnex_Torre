import * as XLSX from 'xlsx';

// =====================================================
// PDF Service - Using jsPDF (requires: npm install jspdf jspdf-autotable)
// =====================================================

// Note: For PDF generation, you'll need to install:
// npm install jspdf jspdf-autotable @types/jspdf

interface ReportConfig {
    title: string;
    subtitle?: string;
    date?: Date;
    logoUrl?: string;
    companyName?: string;
}

interface TableColumn {
    header: string;
    key: string;
    width?: number;
}

// =====================================================
// Excel Export (Already available via xlsx)
// =====================================================

export const exportToExcel = (
    data: any[],
    filename: string,
    sheetName: string = 'Datos'
): void => {
    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        throw error;
    }
};

// =====================================================
// HTML to PDF (Using browser print)
// =====================================================

export const generatePrintableHTML = (
    config: ReportConfig,
    content: string,
    styles: string = ''
): string => {
    const date = config.date || new Date();

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${config.title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 40px;
          color: #1e293b;
          background: white;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 2px solid #3b82f6;
          margin-bottom: 30px;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        
        .logo {
          width: 80px;
          height: 80px;
          object-fit: contain;
        }
        
        .company-info h1 {
          font-size: 24px;
          color: #1e40af;
          margin-bottom: 4px;
        }
        
        .company-info p {
          font-size: 14px;
          color: #64748b;
        }
        
        .header-right {
          text-align: right;
        }
        
        .report-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .report-date {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        
        .content {
          margin-bottom: 40px;
        }
        
        .section {
          margin-bottom: 30px;
        }
        
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e2e8f0;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        th {
          background: #3b82f6;
          color: white;
          padding: 10px 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
        }
        
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
        }
        
        tr:nth-child(even) {
          background: #f8fafc;
        }
        
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }
        
        .stat-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
        }
        
        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #1e40af;
        }
        
        .stat-label {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        
        .footer {
          position: fixed;
          bottom: 20px;
          left: 40px;
          right: 40px;
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          padding-top: 15px;
          border-top: 1px solid #e2e8f0;
        }
        
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 500;
        }
        
        .badge-critical { background: #fef2f2; color: #dc2626; }
        .badge-high { background: #fff7ed; color: #ea580c; }
        .badge-medium { background: #fffbeb; color: #d97706; }
        .badge-low { background: #f0fdf4; color: #16a34a; }
        
        .badge-active { background: #f0fdf4; color: #16a34a; }
        .badge-inactive { background: #fef2f2; color: #dc2626; }
        
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
        
        ${styles}
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          ${config.logoUrl ? `<img src="${config.logoUrl}" class="logo" alt="Logo"/>` : ''}
          <div class="company-info">
            <h1>${config.companyName || 'Torre de Control'}</h1>
            <p>Sistema de Gestión de Flotas</p>
          </div>
        </div>
        <div class="header-right">
          <div class="report-title">${config.title}</div>
          ${config.subtitle ? `<div class="report-date">${config.subtitle}</div>` : ''}
          <div class="report-date">Generado: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
        </div>
      </div>
      
      <div class="content">
        ${content}
      </div>
      
      <div class="footer">
        <p>Torre de Control - Sistema de Gestión de Flotas | Reporte generado automáticamente | Página 1</p>
      </div>
    </body>
    </html>
  `;
};

// =====================================================
// Report Generators
// =====================================================

export const generateAlertReport = (
    alerts: any[],
    config: Partial<ReportConfig> = {}
): string => {
    const stats = {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length,
        resolved: alerts.filter(a => a.status === 'resolved').length,
    };

    const content = `
    <div class="section">
      <h2 class="section-title">Resumen de Alertas</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Alertas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #dc2626;">${stats.critical}</div>
          <div class="stat-label">Críticas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #ea580c;">${stats.high}</div>
          <div class="stat-label">Altas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #16a34a;">${stats.resolved}</div>
          <div class="stat-label">Resueltas</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">Detalle de Alertas</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha/Hora</th>
            <th>Placa</th>
            <th>Tipo</th>
            <th>Severidad</th>
            <th>Conductor</th>
            <th>Ubicación</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map(alert => `
            <tr>
              <td>${new Date(alert.timestamp).toLocaleString()}</td>
              <td><strong>${alert.plate}</strong></td>
              <td>${alert.type}</td>
              <td><span class="badge badge-${alert.severity}">${alert.severity}</span></td>
              <td>${alert.driver || '-'}</td>
              <td>${alert.location || '-'}</td>
              <td><span class="badge badge-${alert.status === 'resolved' ? 'active' : 'inactive'}">${alert.status || 'pending'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

    return generatePrintableHTML(
        {
            title: 'Reporte de Alertas',
            subtitle: `${stats.total} alertas en el período`,
            ...config,
        },
        content
    );
};

export const generateFleetReport = (
    vehicles: any[],
    config: Partial<ReportConfig> = {}
): string => {
    const stats = {
        total: vehicles.length,
        moving: vehicles.filter(v => v.status === 'En Movimiento').length,
        stopped: vehicles.filter(v => v.status === 'Detenido').length,
        idle: vehicles.filter(v => v.status === 'Encendido').length,
        off: vehicles.filter(v => v.status === 'Apagado').length,
        avgSpeed: vehicles.length > 0
            ? Math.round(vehicles.reduce((acc, v) => acc + v.speed, 0) / vehicles.length)
            : 0,
    };

    const content = `
    <div class="section">
      <h2 class="section-title">Estado de la Flota</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Vehículos</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #16a34a;">${stats.moving}</div>
          <div class="stat-label">En Movimiento</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #d97706;">${stats.idle}</div>
          <div class="stat-label">Encendidos (Idle)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.avgSpeed} km/h</div>
          <div class="stat-label">Velocidad Promedio</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">Detalle de Vehículos</h2>
      <table>
        <thead>
          <tr>
            <th>Placa</th>
            <th>Estado</th>
            <th>Velocidad</th>
            <th>Conductor</th>
            <th>Ubicación</th>
            <th>Contrato</th>
            <th>Última Actualización</th>
          </tr>
        </thead>
        <tbody>
          ${vehicles.map(v => `
            <tr>
              <td><strong>${v.plate}</strong></td>
              <td>${v.status}</td>
              <td>${v.speed} km/h</td>
              <td>${v.driver || '-'}</td>
              <td>${v.location || '-'}</td>
              <td>${v.contract || '-'}</td>
              <td>${new Date(v.lastUpdate).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

    return generatePrintableHTML(
        {
            title: 'Reporte de Flota',
            subtitle: `${stats.total} vehículos monitoreados`,
            ...config,
        },
        content
    );
};

export const generateInspectionReport = (
    inspections: any[],
    config: Partial<ReportConfig> = {}
): string => {
    const stats = {
        total: inspections.length,
        ok: inspections.filter(i => i.status === 'OK').length,
        noInspection: inspections.filter(i => i.status?.includes('Sin inspección')).length,
        late: inspections.filter(i => i.status?.includes('Fuera de tiempo')).length,
    };

    const content = `
    <div class="section">
      <h2 class="section-title">Resumen de Inspecciones Preoperacionales</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Vehículos</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #16a34a;">${stats.ok}</div>
          <div class="stat-label">OK (${stats.total > 0 ? Math.round(stats.ok / stats.total * 100) : 0}%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #dc2626;">${stats.noInspection}</div>
          <div class="stat-label">Sin Inspección</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #d97706;">${stats.late}</div>
          <div class="stat-label">Fuera de Tiempo</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">Detalle de Inspecciones</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Placa</th>
            <th>Conductor</th>
            <th>Contrato</th>
            <th>Hora Inspección</th>
            <th>Hallazgos</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${inspections.map(i => `
            <tr>
              <td>${i.inspection_date || '-'}</td>
              <td><strong>${i.plate}</strong></td>
              <td>${i.driver || '-'}</td>
              <td>${i.contract || '-'}</td>
              <td>${i.inspection_datetime ? new Date(i.inspection_datetime).toLocaleTimeString() : '-'}</td>
              <td>${i.findings_count || 0}</td>
              <td>${i.status || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

    return generatePrintableHTML(
        {
            title: 'Reporte de Inspecciones Preoperacionales',
            subtitle: `Cumplimiento: ${stats.total > 0 ? Math.round(stats.ok / stats.total * 100) : 0}%`,
            ...config,
        },
        content
    );
};

// =====================================================
// Print/Download Functions
// =====================================================

export const printReport = (htmlContent: string): void => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
};

export const downloadReportAsHTML = (htmlContent: string, filename: string): void => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export default {
    exportToExcel,
    generateAlertReport,
    generateFleetReport,
    generateInspectionReport,
    printReport,
    downloadReportAsHTML,
};
