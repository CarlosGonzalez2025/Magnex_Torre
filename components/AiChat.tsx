import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Sparkles, Loader2, Database, AlertTriangle } from 'lucide-react';

interface ToolResult { tool: string; args: Record<string, any>; result: any; }
interface ChatMessage { role: 'user' | 'assistant'; content: string; toolResults?: ToolResult[]; error?: boolean; }

const SUGGESTIONS = [
  '¿Qué vehículos tuvieron excesos de velocidad hoy?',
  '¿La placa ABC123 presentó excesos hoy?',
  '¿Cuántos km recorrió la flota hoy?',
  '¿Cuántos vehículos y conductores tiene cada contrato?',
  'Top 10 conductores por ralentí del último período',
];

// ── Render genérico de los datos consultados ──
function DataValue({ value }: { value: any }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">(vacío)</span>;
    if (typeof value[0] === 'object' && value[0] !== null) {
      const cols: string[] = Array.from(value.reduce((s: Set<string>, r: any) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>()));
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                {cols.map(c => <th key={c} className="px-1.5 py-1 text-left font-semibold uppercase tracking-wide">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {value.map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-700/40">
                  {cols.map(c => <td key={c} className="px-1.5 py-1 text-slate-700 dark:text-slate-300">{formatScalar(r[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <span className="text-slate-700 dark:text-slate-300">{value.map(formatScalar).join(', ')}</span>;
  }
  if (typeof value === 'object') {
    return (
      <div className="space-y-0.5">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 shrink-0">{k}:</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium break-all">
              {typeof v === 'object' && v !== null ? <DataValue value={v} /> : formatScalar(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-slate-700 dark:text-slate-300">{formatScalar(value)}</span>;
}

function formatScalar(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('es-CO');
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

export const AiChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages(m => [...m, { role: 'assistant', content: data.error || 'Ocurrió un error al consultar.', error: true }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: data.answer || 'Sin respuesta.', toolResults: data.toolResults }]);
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `No se pudo conectar con el asistente: ${e.message}`, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
          title="Asistente IA"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:inline">Asistente IA</span>
        </button>
      )}

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[400px] h-[70vh] max-h-[640px] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">Asistente Torre de Control</div>
                <div className="text-[10px] text-white/70">Excesos, km, ralentí, contratos y flota</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-slate-950/40">
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-indigo-500" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 px-4">
                  Pregúntame por <strong>excesos de velocidad</strong>, <strong>km recorridos</strong>, <strong>ralentí</strong>,
                  una <strong>placa</strong>, un <strong>conductor</strong> o un <strong>contrato</strong>. Respondo con datos reales de la base.
                </p>
                <div className="flex flex-col gap-1.5 px-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="text-left text-[11px] px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : m.error
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 rounded-bl-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                }`}>
                  {m.error && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {m.toolResults && m.toolResults.length > 0 && (
                    <details className="mt-2 group">
                      <summary className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer hover:text-indigo-500 select-none">
                        <Database className="w-3 h-3" /> Datos consultados ({m.toolResults.length})
                      </summary>
                      <div className="mt-1.5 space-y-2">
                        {m.toolResults.map((tr, j) => (
                          <div key={j} className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-2">
                            <div className="text-[9px] uppercase tracking-wide text-indigo-500 font-bold mb-1">{tr.tool}</div>
                            <DataValue value={tr.result} />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Consultando la base…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Escribe tu consulta…"
                disabled={loading}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-400 disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
              Las cifras provienen de la base de datos. El asistente puede equivocarse al interpretar; verifica los datos consultados.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
