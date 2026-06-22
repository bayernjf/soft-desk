import { Grid, List, Sparkles, TrendingUp, Clock, Zap } from 'lucide-react';
import { useStore } from '../store';
import { SoftwareCard } from './SoftwareCard';

export function SoftwareGrid() {
  const { software, categories, viewMode, setViewMode, searchQuery, selectedCategory } = useStore();

  // Filter software based on search and category
  let filteredSoftware = software;

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredSoftware = software.filter(
      app =>
        app.name.toLowerCase().includes(query) ||
        app.category.toLowerCase().includes(query) ||
        (app.publisher && app.publisher.toLowerCase().includes(query))
    );
  } else if (selectedCategory) {
    filteredSoftware = software.filter(app => app.category === selectedCategory);
  }

  const title = searchQuery
    ? `搜索结果: "${searchQuery}"`
    : selectedCategory
    ? selectedCategory
    : '全部软件';

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#e6edf3]">{title}</h2>
          <p className="text-sm text-[#8b949e] mt-1">
            共 {filteredSoftware.length} 款软件
            {selectedCategory && (
              <span className="ml-2 text-[#00d4aa]">
                • AI 自动分类
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#21262d] rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-[#00d4aa]/20 text-[#00d4aa]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-[#00d4aa]/20 text-[#00d4aa]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AI Tip */}
      {selectedCategory && (
        <div className="mb-6 p-4 bg-gradient-to-r from-[#a371f7]/10 to-[#00d4aa]/10 rounded-xl border border-[#a371f7]/20">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-[#a371f7]" />
            <span className="text-[#e6edf3]">
              这些软件已由 AI 根据功能语义自动分类到「{selectedCategory}」
            </span>
          </div>
        </div>
      )}

      {/* Grid */}
      {filteredSoftware.length > 0 ? (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
              : 'space-y-2'
          }
        >
          {filteredSoftware.map((app, index) => (
            <SoftwareCard key={app.id} software={app} index={index} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[#21262d] flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[#6e7681]" />
          </div>
          <h3 className="text-lg font-medium text-[#e6edf3] mb-2">没有找到匹配的软件</h3>
          <p className="text-sm text-[#8b949e]">尝试用更通用的关键词搜索</p>
        </div>
      )}
    </div>
  );
}
