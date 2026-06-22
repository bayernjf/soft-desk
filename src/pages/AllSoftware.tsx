import { SearchBar } from '../components/SearchBar';
import { SoftwareGrid } from '../components/SoftwareGrid';

export function AllSoftware() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#30363d]">
        <div className="flex items-center gap-4 mb-4">
          <SearchBar />
        </div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">全部软件</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          管理您的所有软件，AI 将自动识别并分类
        </p>
      </div>

      {/* Content */}
      <SoftwareGrid />
    </div>
  );
}
