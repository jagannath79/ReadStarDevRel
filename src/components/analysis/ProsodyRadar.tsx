'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ProsodyScoreBreakdown } from '@/utils/acousticAnalysis';

interface Props {
  current: ProsodyScoreBreakdown;
  previous?: ProsodyScoreBreakdown;
  classAverage?: ProsodyScoreBreakdown;
  size?: 'sm' | 'md' | 'lg';
  showLegend?: boolean;
}

const AXES = [
  { key: 'expression' as const, label: 'Expression' },
  { key: 'phrasing' as const, label: 'Phrasing' },
  { key: 'smoothness' as const, label: 'Smoothness' },
  { key: 'pace' as const, label: 'Pace' },
];

const SIZE_MAP = { sm: 200, md: 280, lg: 360 };

function buildData(
  current: ProsodyScoreBreakdown,
  previous?: ProsodyScoreBreakdown,
  classAverage?: ProsodyScoreBreakdown,
) {
  return AXES.map(({ key, label }) => ({
    axis: label,
    current: current[key],
    previous: previous?.[key],
    class: classAverage?.[key],
  }));
}

// Custom dot for the radar
function CustomDot(props: { cx?: number; cy?: number; fill?: string }) {
  const { cx = 0, cy = 0, fill } = props;
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="white" strokeWidth={1.5} />;
}

export default function ProsodyRadar({
  current,
  previous,
  classAverage,
  size = 'md',
  showLegend = true,
}: Props) {
  const height = SIZE_MAP[size];
  const data = buildData(current, previous, classAverage);

  return (
    <div className="flex flex-col items-center gap-2">
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: '#4b5563', fontSize: 12, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickCount={5}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value}`, name]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />

          {classAverage && (
            <Radar
              name="Class Avg"
              dataKey="class"
              stroke="#9ca3af"
              fill="#9ca3af"
              fillOpacity={0.1}
              strokeDasharray="4 2"
              dot={false}
            />
          )}

          {previous && (
            <Radar
              name="Previous"
              dataKey="previous"
              stroke="#93c5fd"
              fill="#93c5fd"
              fillOpacity={0.2}
              dot={<CustomDot fill="#93c5fd" />}
            />
          )}

          <Radar
            name="Current"
            dataKey="current"
            stroke="#1B3A8C"
            fill="#1B3A8C"
            fillOpacity={0.25}
            dot={<CustomDot fill="#1B3A8C" />}
          />

          {showLegend && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>

      {/* Composite score */}
      <div className="text-center">
        <p className="text-2xl font-black text-[#1B3A8C]">{current.composite}</p>
        <p className="text-xs text-gray-500 font-medium">Prosody Composite</p>
      </div>
    </div>
  );
}

/** Mini inline version for dashboards */
export function ProsodyRadarMini({ current }: { current: ProsodyScoreBreakdown }) {
  return <ProsodyRadar current={current} size="sm" showLegend={false} />;
}
