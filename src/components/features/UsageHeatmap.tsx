import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMinutes } from '@/services/software.service';
import { useDailyUsageHeatmap } from '@/hooks/useUsageStats';
import { cn } from '@/lib/utils';

const WEEKS = 26;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface DayCell {
  date: string;
  minutes: number;
  inFuture: boolean;
}

function dateKey(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** 把周一作为一周开始:周日(getDay()===0) 映射到 6,其余减 1 */
function mondayIndex(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

/** 按使用分钟数映射到 0-4 的强度等级,用于色阶 */
function intensityLevel(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 120) return 2;
  if (minutes < 300) return 3;
  return 4;
}

const LEVEL_COLORS = ['#1e293b', '#3b1d6e', '#5b21b6', '#7c3aed', '#a855f7'];

export function UsageHeatmap() {
  const { byDate, loading } = useDailyUsageHeatmap();
  const [hover, setHover] = useState<{ cell: DayCell; x: number; y: number } | null>(null);

  // 以本周一为最后一列,向前推 WEEKS 周,构建 [周][星期] 的二维网格
  const { weeks, monthMarks, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 本周周一
    const thisMonday = new Date(today.getTime() - mondayIndex(today) * DAY_MS);
    // 网格起点:thisMonday 往前 (WEEKS-1) 周
    const start = new Date(thisMonday.getTime() - (WEEKS - 1) * 7 * DAY_MS);

    const grid: DayCell[][] = [];
    let sum = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        const key = dateKey(cellDate);
        const minutes = Math.round(byDate.get(key) ?? 0);
        const inFuture = cellDate.getTime() > today.getTime();
        if (!inFuture) sum += minutes;
        col.push({ date: key, minutes, inFuture });
      }
      grid.push(col);
    }

    // 月份标签:某一列首格(周一)的月份与上一列不同时,记录该列索引
    const marks: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    grid.forEach((col, idx) => {
      const month = new Date(col[0].date).getMonth();
      if (month !== lastMonth) {
        marks.push({ weekIndex: idx, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });

    return { weeks: grid, monthMarks: marks, total: sum };
  }, [byDate]);

  const activeDays = useMemo(
    () => weeks.flat().filter((c) => !c.inFuture && c.minutes > 0).length,
    [weeks]
  );

  return (
    <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">使用日历热力图</h2>
          <p className="text-xs text-slate-500 mt-1">
            近半年每日使用时长 · 累计 {formatMinutes(total)} · {activeDays} 天有记录
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="inline-flex flex-col gap-1.5 min-w-full">
          {/* 月份标签行 */}
          <div className="flex gap-[3px] pl-7">
            {weeks.map((_, idx) => {
              const mark = monthMarks.find((m) => m.weekIndex === idx);
              return (
                <div key={idx} className="w-3 text-[9px] text-slate-500 leading-none">
                  {mark ? mark.label : ''}
                </div>
              );
            })}
          </div>

          {/* 7 行(周一到周日)× WEEKS 列 */}
          <div className="flex gap-[5px]">
            <div className="flex flex-col gap-[3px] pr-1">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className="h-3 w-4 text-[9px] text-slate-500 leading-3 text-right"
                >
                  {i % 2 === 0 ? label : ''}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((col, w) => (
                <div key={w} className="flex flex-col gap-[3px]">
                  {col.map((cell) => (
                    <div
                      key={cell.date}
                      onMouseEnter={(e) =>
                        !cell.inFuture &&
                        setHover({ cell, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        'w-3 h-3 rounded-[3px] transition-transform',
                        cell.inFuture
                          ? 'opacity-0 pointer-events-none'
                          : 'hover:ring-1 hover:ring-violet-300/60 hover:scale-110'
                      )}
                      style={{ backgroundColor: LEVEL_COLORS[intensityLevel(cell.minutes)] }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 色阶图例 */}
          <div className="flex items-center gap-1.5 justify-end pt-2 text-[10px] text-slate-500">
            <span>少</span>
            {LEVEL_COLORS.map((color) => (
              <span
                key={color}
                className="w-3 h-3 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="fixed z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 shadow-xl pointer-events-none text-xs"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="text-slate-200 font-medium">
            {hover.cell.minutes > 0 ? formatMinutes(hover.cell.minutes) : '无使用记录'}
          </div>
          <div className="text-slate-500 text-[11px]">{hover.cell.date}</div>
        </div>
      )}
    </section>
  );
}
