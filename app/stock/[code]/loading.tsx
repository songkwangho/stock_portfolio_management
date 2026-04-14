export default function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center space-x-2 text-slate-400">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">종목 정보를 불러오는 중이에요...</span>
      </div>
    </div>
  );
}
