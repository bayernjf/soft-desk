import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { TrendingUp, PieChart as PieChartIcon } from 'lucide-react';
import { useStore } from '../store';

export function WeeklyChart() {
  const { stats } = useStore();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-[#58a6ff]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">本周使用趋势</h3>
        <span className="text-xs text-[#6e7681] ml-auto">每日使用时长（小时）</span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.weeklyTrend}>
            <defs>
              <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 12 }}
              tickFormatter={value => `${value}h`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '8px',
                color: '#e6edf3',
              }}
              formatter={(value: number) => [`${value} 小时`, '使用时长']}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="#00d4aa"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorHours)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CategoryPieChart() {
  const { stats } = useStore();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="w-4 h-4 text-[#a371f7]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">软件分类占比</h3>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={stats.categoryDistribution}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="count"
              nameKey="name"
            >
              {stats.categoryDistribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '8px',
                color: '#e6edf3',
              }}
              formatter={(value: number, name: string) => [`${value} 款`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {stats.categoryDistribution.map(item => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-[#8b949e]">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsageBarChart() {
  const { stats } = useStore();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-[#00d4aa]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">使用时长对比</h3>
        <span className="text-xs text-[#6e7681] ml-auto">Top 5 应用</span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.topApps} layout="vertical">
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#e6edf3', fontSize: 12 }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '8px',
                color: '#e6edf3',
              }}
              formatter={(value: number) => [`${Math.floor(value / 3600)} 小时`, '使用时长']}
            />
            <Bar
              dataKey="usageTime"
              fill="#00d4aa"
              radius={[0, 4, 4, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
