import { Search, X } from 'lucide-react';
import { useStore } from '../store';

export function SearchBar() {
  const { searchQuery, setSearchQuery, isSearching } = useStore();

  return (
    <div className="flex-1 max-w-2xl">
      <div
        className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#21262d] border transition-all ${
          isSearching
            ? 'border-[#00d4aa] shadow-[0_0_0_4px_rgba(0,212,170,0.1)]'
            : 'border-[#30363d] hover:border-[#8b949e]'
        }`}
      >
        <Search
          className={`w-5 h-5 transition-colors ${
            isSearching ? 'text-[#00d4aa]' : 'text-[#6e7681]'
          }`}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="输入描述来搜索软件，例如：'截屏工具' 或 '做表格'"
          className="flex-1 bg-transparent text-sm text-[#e6edf3] placeholder-[#6e7681] outline-none"
        />
        {isSearching && (
          <button
            onClick={() => setSearchQuery('')}
            className="p-1 rounded hover:bg-[#30363d] transition-colors"
          >
            <X className="w-4 h-4 text-[#8b949e]" />
          </button>
        )}
        <div className="flex items-center gap-2 text-xs text-[#6e7681]">
          <kbd className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px]">⌘</kbd>
          <kbd className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px]">K</kbd>
        </div>
      </div>
    </div>
  );
}
