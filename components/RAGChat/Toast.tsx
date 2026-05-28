export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm max-w-xs animate-fade-in">
      {message}
    </div>
  );
}
