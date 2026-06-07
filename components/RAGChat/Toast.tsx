import { Info } from 'lucide-react';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900/95 text-white px-4.5 py-3 rounded-xl shadow-lg shadow-slate-900/10 text-xs md:text-sm max-w-sm border border-slate-800/50 backdrop-blur animate-fade-in-up">
      <Info className="w-4.5 h-4.5 text-blue-400 shrink-0" />
      <span className="font-medium">{message}</span>
    </div>
  );
}
