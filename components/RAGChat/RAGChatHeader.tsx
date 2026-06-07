export function RAGChatHeader() {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
        Book discovery
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
        想找什么书？
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        描述主题、读者、数量、预算或不想出现的内容。系统会先生成查询草稿，确认后再检索。
      </p>
    </div>
  );
}
