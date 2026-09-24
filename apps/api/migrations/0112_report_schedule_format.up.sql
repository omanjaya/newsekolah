-- Scheduled exports render as XLSX by default (matching every existing
-- schedule's prior behaviour); this lets a schedule ask for PDF instead,
-- the same choice an interactive export's ReportExportDialog offers.
alter table report_schedules
  add column format text not null default 'xlsx' check (format in ('xlsx', 'pdf'));
