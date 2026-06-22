import { Play, Clock, TrendingUp, Zap } from 'lucide-react';
import { Software } from '../types';
import { useStore } from '../store';
import { mockCategories } from '../mockData';

interface SoftwareCardProps {
  software: Software;
  index: number;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}小时${mins}分钟`;
}

function getCategoryColor(category: string): string {
  const found = mockCategories.find(c => c.name === category);
  return found?.color || '#8b949e';
}

export function SoftwareCard({ software, index }: SoftwareCardProps) {
  const { launchApp } = useStore();
  const categoryColor = getCategoryColor(software.category);

  return (
    <div
      className="group relative bg-[#161b22] border border-[#30363d] rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#00d4aa]/50 hover:shadow-[0_8px_30px_rgba(0,212,170,0.15)] cursor-pointer"
      style={{
        animation: `fadeInUp 0.4s ease-out ${index * 50}ms both`,
      }}
      onClick={() => launchApp(software.id)}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00d4aa]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative z-10">
        {/* Icon */}
        <div className="flex justify-center mb-3">
          {software.icon.startsWith('http') ? (
            <img
              src={software.icon}
              alt={software.name}
              className="w-12 h-12 rounded-xl object-contain"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#21262d] flex items-center justify-center text-2xl">
              {software.icon}
            </div>
          )}
        </div>

        {/* Name */}
        <h3 className="text-sm font-medium text-[#e6edf3] text-center truncate mb-1">
          {software.name}
        </h3>

        {/* Category & Usage */}
        <div className="text-xs text-[#6e7681] text-center space-y-1">
          <div
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${categoryColor}15` }}
          >
            <span style={{ color: categoryColor }}>{software.category}</span>
          </div>
          <div className="flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            <span>累计 {formatTime(software.usageMinutes * 60)}</span>
          </div>
        </div>

        {/* Launch Button */}
        <button
          className="mt-3 w-full py-2 rounded-lg bg-[#00d4aa]/10 text-[#00d4aa] text-xs font-medium opacity-0 group-hover:opacity-100 transition-all hover:bg-[#00d4aa]/20 flex items-center justify-center gap-1"
          onClick={e => {
            e.stopPropagation();
            launchApp(software.id);
          }}
        >
          <Play className="w-3 h-3" />
          启动
        </button>
      </div>

      {/* Stats badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-[#6e7681]">
        <TrendingUp className="w-3 h-3" />
        <span>{software.launchCount}次</span>
      </div>

      {/* AI indicator */}
      <div className="absolute bottom-2 left-2">
        <Zap className="w-3 h-3 text-[#a371f7] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}
