import { BookOpenIcon } from 'tdesign-icons-react';

export function RAGChatHeader() {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-sky-700 font-semibold mb-3">
        <BookOpenIcon />
        <span>INTELLIGENT RECOMMENDATIONS</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">智能图书推荐系统</h1>
      <p className="text-slate-600 max-w-3xl text-lg leading-relaxed">
        直接输入你的选书要求，我会给出推荐书单、推荐理由，以及下一步可以继续追问的方向。
      </p>
    </div>
  );
}
