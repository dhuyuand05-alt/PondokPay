import {
  FinancialReportValidationError,
  getFinancialReportData,
  parseFinancialReportFilters,
} from './data.js';
import { buildFinancialReportCsv, streamFinancialReportPdf } from './exports.js';

const loadReport = async (req, res) => {
  try {
    const filters = parseFinancialReportFilters(req.query);
    const report = await getFinancialReportData(filters);
    return { report };
  } catch (error) {
    if (error instanceof FinancialReportValidationError) {
      res.status(400).json({ message: error.message });
      return null;
    }
    console.error('Get financial report error:', error);
    res.status(500).json({ message: 'Gagal mengambil laporan finansial.' });
    return null;
  }
};

export const getFinancialReport = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  return res.status(200).json({ data: result.report });
};

export const exportFinancialReportCsv = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  const filename = `laporan-finansial-${result.report.period.start_date}-${result.report.period.end_date}.csv`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return res.status(200).send(buildFinancialReportCsv(result.report));
};

export const exportFinancialReportPdf = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  const filename = `laporan-finansial-${result.report.period.start_date}-${result.report.period.end_date}.pdf`;
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return streamFinancialReportPdf(result.report, res);
};
