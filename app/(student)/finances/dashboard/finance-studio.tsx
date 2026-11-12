'use client';
// The student's financial command center, rendered by AG Studio (by AG Grid) in view mode.
// Data sources come from PostgreSQL (lib/finance-data.ts); the report below lays out KPI tiles,
// filters, charts and grids. Same AG Studio API as the boilerplate's /dashboard.
import { useMemo, useSyncExternalStore } from 'react';
import {
  studioTheme,
  type AgDataSourcesDefinition,
  type AgFieldDefinition,
  type AgFormat,
  type AgReportState,
  type AgWidgetLayoutState,
} from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import type { FinanceData } from '@/lib/finance-data';

// ---- Data sources -------------------------------------------------------------------

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({
    id, name, format, ...(hide && { hide }),
    // Show dollars as "$5.00" rather than a bare number.
    ...(format === 'currencyFormat' && { formatOptions: { format: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) } }),
  }));

function buildData(d: FinanceData): AgDataSourcesDefinition {
  const dates = [...d.transactions.map((t) => t.date), ...d.received.map((r) => r.date)].sort();
  const today = d.asOf.slice(0, 10);
  return {
    description: "One student's PayPal sandbox activity on Sprout (USD). Only completed, PayPal-verified transactions.",
    sources: [
      {
        id: 'transactions',
        name: 'My Transactions',
        description: 'Completed PayPal sandbox marketplace purchases and goal contributions made by this student.',
        data: d.transactions,
        fields: fields([
          ['id', 'Transaction ID', 'textFormat', true],
          ['date', 'Date', 'dateFormat'],
          ['type', 'Type', 'textFormat'],
          ['item', 'Item / Goal', 'textFormat'],
          ['category', 'Category', 'textFormat'],
          ['amount', 'Amount', 'currencyFormat'],
          ['purchaseAmount', 'Marketplace Spending', 'currencyFormat'],
          ['contributionAmount', 'Contributions Made', 'currencyFormat'],
          ['paypalOrderId', 'PayPal Order ID', 'textFormat'],
          ['status', 'Status', 'textFormat'],
          ['environment', 'Environment', 'textFormat'],
        ]),
      },
      {
        id: 'goals',
        name: 'My Funding Goals',
        description: "This student's funding goals and progress.",
        data: d.goals,
        fields: fields([
          ['id', 'Goal ID', 'textFormat', true],
          ['title', 'Goal', 'textFormat'],
          ['kind', 'Goal Type', 'textFormat'],
          ['raised', 'Raised', 'currencyFormat'],
          ['target', 'Target', 'currencyFormat'],
          ['remaining', 'Remaining', 'currencyFormat'],
          ['label', 'Data', 'textFormat'],
          ['status', 'Goal Status', 'textFormat'],
          ['linkedTo', 'Linked To', 'textFormat'],
        ]),
      },
      {
        id: 'received',
        name: 'Funding Received',
        description: "Completed PayPal sandbox contributions toward this student's goals.",
        data: d.received,
        fields: fields([
          ['id', 'Contribution ID', 'textFormat', true],
          ['date', 'Received On', 'dateFormat'],
          ['goal', 'Goal', 'textFormat'],
          ['linkedTo', 'Linked To', 'textFormat'],
          ['amount', 'Funding Received', 'currencyFormat'],
          ['environment', 'Environment', 'textFormat'],
        ]),
      },
    ],
    relationships: [
      { id: 'tx-calendar', source: { tableId: 'transactions', fieldId: 'date' }, target: { calendarId: 'calendar' } },
      { id: 'received-calendar', source: { tableId: 'received', fieldId: 'date' }, target: { calendarId: 'calendar' } },
    ],
    calendars: [
      {
        id: 'calendar',
        label: 'Calendar',
        range: { from: { type: 'date', value: dates[0] ?? today }, to: { type: 'date', value: dates.at(-1) ?? today } },
        fragments: ['year', 'month', 'week', 'day'],
      },
    ],
    expressions: [
      {
        id: 'goalProgress',
        name: 'Goal Progress',
        description: 'Raised / target across my goals.',
        format: 'percentageFormat',
        isMeasure: true,
        expression: { operator: 'divide', inputs: [{ id: 'goals.raised', aggregation: 'sum' }, { id: 'goals.target', aggregation: 'sum' }] },
      },
    ],
  };
}

// ---- Report -------------------------------------------------------------------------

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: 'sum' as const });
const typo = (FONT: string, fontSize: number, fontWeight: 'normal' | 'bold' = 'normal') => ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: 'normal' as const });
const kpi = (FONT: string, text: string, value: { id: string; aggregation?: 'sum' | 'countd' }) => ({
  type: 'value' as const,
  dataMapping: { value: [value] },
  format: {
    title: { enabled: true, text, typography: typo(FONT, 14, 'bold') },
    caption: { enabled: true, text: '', typography: typo(FONT, 0) },
    style: { typography: typo(FONT, 26, 'bold') },
  },
});

const buildReport = (FONT: string): AgReportState => ({
  selectedPageId: 'overview',
  // Filtering happens through the on-canvas filter widgets, so the side panel starts collapsed.
  panels: { filters: { collapsed: true } },
  pages: [
    {
      id: 'overview',
      widgets: {
        'type-filter': {
          type: 'button-filter',
          dataMapping: { value: [{ id: 'transactions.type' }] },
          format: { ...title('Transaction type'), style: { dimensions: { height: 32, minWidth: 96 } } },
        },
        'date-filter': {
          type: 'date-filter',
          dataMapping: { value: [{ id: 'transactions.date' }] },
          format: { style: { filterType: 'relative' } },
        },
        'kpi-spending': kpi(FONT, '🛍️ Marketplace spending', sum('transactions.purchaseAmount')),
        'kpi-contributions': kpi(FONT, '🎯 Contributions made', sum('transactions.contributionAmount')),
        'kpi-received': kpi(FONT, '💌 Funding received', sum('received.amount')),
        'kpi-count': kpi(FONT, '🧾 Transactions', { id: 'transactions.id', aggregation: 'countd' }),
        'by-category': {
          type: 'donut-chart',
          dataMapping: { categoryKey: [{ id: 'transactions.category' }], valueKey: [sum('transactions.amount')] },
          format: { ...title('Where my money went'), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
        },
        'by-month': {
          type: 'column-chart-stacked',
          dataMapping: {
            categoryKey: [{ id: 'calendar::month' }],
            valueKey: [sum('transactions.purchaseAmount'), sum('transactions.contributionAmount')],
          },
          format: { ...title('Spending and contributions by month'), style: { theme: { common: { legend: { enabled: true } } } } },
        },
        history: {
          type: 'grid',
          dataMapping: {
            cols: [
              { id: 'transactions.date' },
              { id: 'transactions.type' },
              { id: 'transactions.item' },
              { id: 'transactions.category' },
              sum('transactions.amount'),
              { id: 'transactions.paypalOrderId' },
              { id: 'transactions.status' },
              { id: 'transactions.environment' },
            ],
          },
          sort: [{ field: { id: 'transactions.date' }, direction: 'desc' }],
          format: title('Transaction history (PayPal sandbox, completed only)'),
        },
        'goal-bars': {
          type: 'bar-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'goals.title' }], valueKey: [sum('goals.raised'), sum('goals.target')] },
          format: { ...title('My funding goals: raised vs target'), style: { theme: { common: { legend: { enabled: true } } } } },
        },
        'goal-gauge': {
          type: 'radial-gauge',
          dataMapping: { value: [{ id: 'goalProgress' }] },
          format: {
            ...title('Overall goal progress'),
            style: {
              scaleLabel: { min: 0, max: 1 },
              label: { typography: typo(FONT, 26, 'bold') },
              secondaryLabel: { enabled: true, text: 'of my targets raised', typography: typo(FONT, 12) },
            },
          },
        },
        'goals-grid': {
          type: 'grid',
          dataMapping: {
            cols: [{ id: 'goals.title' }, { id: 'goals.kind' }, sum('goals.raised'), sum('goals.target'), sum('goals.remaining'), { id: 'goals.status' }, { id: 'goals.linkedTo' }, { id: 'goals.label' }],
          },
          format: title('Goal details'),
        },
        'received-grid': {
          type: 'grid',
          dataMapping: { cols: [{ id: 'received.date' }, { id: 'received.goal' }, { id: 'received.linkedTo' }, sum('received.amount')] },
          sort: [{ field: { id: 'received.date' }, direction: 'desc' }],
          format: title('Funding received toward my goals'),
        },
      },
      widgetLayout: {
        'type-filter': at(0, 0, 14, 8),
        'date-filter': at(14, 0, 10, 8),
        'kpi-spending': at(0, 8, 6, 7),
        'kpi-contributions': at(6, 8, 6, 7),
        'kpi-received': at(12, 8, 6, 7),
        'kpi-count': at(18, 8, 6, 7),
        'by-category': at(0, 15, 10, 20),
        'by-month': at(10, 15, 14, 20),
        history: at(0, 35, 24, 13),
        'goal-bars': at(0, 48, 15, 18),
        'goal-gauge': at(15, 48, 9, 18),
        'goals-grid': at(0, 66, 15, 12),
        'received-grid': at(15, 66, 9, 12),
      },
    },
  ],
});

// ---- Theme: Sprout pastels ----------------------------------------------------

const PALETTE = ['#7cc4ea', '#ff9f80', '#8fc27f', '#b89be0', '#ffcf5c', '#f08fb0', '#5fb3a8', '#e6a86b', '#9aa7f0', '#c9b28f'];
const buildTheme = (FONT: string) => studioTheme.withParams({
  fontFamily: FONT,
  fontSize: 14,
  textColor: '#3b3633',
  foregroundColor: '#3b3633',
  subtleTextColor: '#7a716b',
  backgroundColor: '#fffdf8',
  borderColor: '#efe3d0',
  accentColor: '#5aa9d6',
  iconColor: '#3b3633',
  rowHoverColor: '#fff3e3',
  // Defaults (600px / 720px) would overflow phone screens; widgets stack on narrow screens instead.
  studioMinWidth: 300,
  studioCanvasMinWidth: 300,
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: 'transparent',
  studioCanvasBorder: false,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: 'transparent',
  studioCanvasPadding: 8,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: FONT,
  studioWidgetBackgroundColor: '#fffdf8',
  studioWidgetBorder: { width: 2, color: '#f3e6d3' },
  studioWidgetBorderRadius: 22,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 16,
  studioWidgetTitleFontWeight: 800,
  studioWidgetTitleTextColor: '#3b3633',
  studioWidgetCaptionTextColor: '#7a716b',
  gridFontFamily: FONT,
  gridFontSize: 14,
  gridHeaderBackgroundColor: '#fff3e3',
  gridHeaderTextColor: '#5c544f',
  gridHeaderFontWeight: 800,
  gridRowHeight: 38,
  gridRowBorder: { width: 1, color: '#f6ecdf' },
  gridWrapperBorder: false,
  chartFontFamily: FONT,
  chartTextColor: '#3b3633',
  chartSubtleTextColor: '#7a716b',
  chartAxisLineColor: '#e8dccb',
  chartGridLineColor: '#f3ebe0',
  ...Object.fromEntries(PALETTE.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]])),
});

const noSubscription = () => () => {};

export function FinanceStudio({ data, licenseKey }: { data: FinanceData; licenseKey?: string }) {
  // AG Studio measures the browser layout, so render it client-side only.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  const studio = useMemo(() => {
    if (!inBrowser) return null;
    // Charts draw on canvas and can't resolve CSS variables, so use next/font's real family name.
    const nunito = getComputedStyle(document.documentElement).getPropertyValue('--font-nunito').trim();
    const font = `${nunito || 'Nunito'}, system-ui, sans-serif`;
    const report = buildReport(font);
    // Phones: stack every widget full-width, in reading order, instead of the 24-column grid.
    if (window.innerWidth < 768) {
      const page = report.pages[0];
      let y = 0;
      const entries = Object.entries(page.widgetLayout ?? {}).filter((e): e is [string, AgWidgetLayoutState] => !!e[1]).sort(([, a], [, b]) => a.yTrack - b.yTrack || a.xTrack - b.xTrack);
      page.widgetLayout = Object.fromEntries(
        entries.map(([id, l]) => {
          const ySpan = id.startsWith('kpi-') ? 6 : l.ySpan;
          const placed = at(0, y, 24, ySpan);
          y += ySpan;
          return [id, placed];
        }),
      );
    }
    const rows = Math.max(...Object.values(report.pages[0].widgetLayout ?? {}).map((l) => (l ? l.yTrack + l.ySpan : 0)));
    return { theme: buildTheme(font), report, sources: buildData(data), height: rows * 18 + 60 };
  }, [inBrowser, data]);
  if (!studio) return <p className="se-card animate-pulse p-6 font-semibold">📊 Loading your dashboard…</p>;
  return (
    <div className="w-full" style={{ height: studio.height }}>
      <div className="h-full">
        <AgStudioProvider licenseKey={licenseKey}>
          <AgStudio
            style={{ height: '100%', width: '100%' }}
            theme={studio.theme}
            data={studio.sources}
            initialState={studio.report}
            mode="view"
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
