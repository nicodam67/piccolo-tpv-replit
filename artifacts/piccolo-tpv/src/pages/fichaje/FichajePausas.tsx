/**
 * FichajePausas — registro y control de descansos.
 * Muestra todos los registros con breaks del período seleccionado.
 */
import { useState, useEffect } from "react";
import { Coffee, ChevronDown, ChevronRight, Clock, Search } from "lucide-react";
import { api } from "../../lib/api-client";

interface Break {
  id: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

interface FichajeRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
}

interface RecordWithBreaks extends FichajeRecord {
  breaks: Break[];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function durationMins(a: string, b: string | null) {
  const end = b ? new Date(b) : new Date();
  return Math.round((end.getTime() - new Date(a).getTime()) / 60000);
}

export default function FichajePausas() {
  const [records, setRecords] = useState<RecordWithBreaks[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [from] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setLoading(true);
    api.get<FichajeRecord[]>(`/api/fichaje/records?from=${from}&to=${to}`)
      .then(async recs => {
        // Fetch breaks for each record
        const withBreaks = await Promise.all(
          recs.map(async r => {
            const breaks = await api.get<Break[]>(`/api/fichaje/records/${r.id}/breaks`).catch(() => []);
            return { ...r, breaks: Array.isArray(breaks) ? breaks : [] };
          })
        );
        // Only show records that have at least one break
        setRecords(withBreaks.filter(r => r.breaks.length > 0));
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = records.filter(r => r.employeeName.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: string) => setExpanded(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const totalBreaks = records.reduce((s, r) => s + r.breaks.length, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pausas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Últimos 7 días · {totalBreaks} pausa{totalBreaks !== 1 ? "s" : ""} registrada{totalBreaks !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando pausas…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Coffee className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{search ? "Sin resultados" : "Sin pausas registradas en el período"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const isOpen = expanded.has(r.id);
            const totalMins = r.breaks.reduce((s, b) => s + durationMins(b.startedAt, b.endedAt), 0);
            return (
              <div key={r.id} className="border border-border rounded-xl bg-card overflow-hidden">
                <button onClick={() => toggle(r.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center font-bold text-xs shrink-0">
                    {r.employeeName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{r.employeeName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock size={11} /> {fmt(r.clockIn)}
                      <span className="text-muted-foreground/40">·</span>
                      <Coffee size={11} /> {r.breaks.length} pausa{r.breaks.length !== 1 ? "s" : ""} · {totalMins} min total
                    </div>
                  </div>
                  {isOpen ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-secondary/30 divide-y divide-border">
                    {r.breaks.map((b, i) => {
                      const mins = durationMins(b.startedAt, b.endedAt);
                      return (
                        <div key={b.id} className="flex items-center gap-3 px-4 py-2">
                          <Coffee size={13} className="text-muted-foreground shrink-0" />
                          <div className="flex-1 text-sm text-foreground">
                            Pausa {i + 1}: {fmt(b.startedAt)}
                            {b.endedAt ? <> → {fmt(b.endedAt)} <span className="text-muted-foreground">({mins} min)</span></> : <span className="text-amber-500"> (en curso)</span>}
                          </div>
                          {b.notes && <p className="text-xs text-muted-foreground italic">{b.notes}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
