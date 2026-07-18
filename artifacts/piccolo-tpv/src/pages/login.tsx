import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetEmployeeLoginList } from "@workspace/api-client-react";
import { Loader2, Delete, Search, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../providers/AuthProvider";

// ── PinKey — reliable touch feedback via pointer events ───────────────────────
function PinKey({
  children,
  onPress,
  className,
}: {
  children: React.ReactNode;
  onPress: () => void;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setPressed(true);
    onPress();
  }, [onPress]);

  const handlePointerUp = useCallback(() => setPressed(false), []);
  const handlePointerLeave = useCallback(() => setPressed(false), []);

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      style={{ touchAction: 'manipulation', userSelect: 'none' }}
      className={`${className} transition-all duration-75 ${pressed ? 'scale-90 brightness-75' : 'scale-100 brightness-100'}`}
    >
      {children}
    </button>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { data: employees, isLoading: loadingEmployees } = useGetEmployeeLoginList();
  const { login } = useAuth();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
    try { return localStorage.getItem('lastEmployeeId') ?? null; } catch { return null; }
  });
  const [pin, setPin] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("employee");
  }, []);

  useEffect(() => {
    if (pin.length === 4 && selectedEmployeeId && !isPending) {
      setIsPending(true);
      login(selectedEmployeeId, pin)
        .then(() => {
          const emp = JSON.parse(localStorage.getItem('employee') ?? '{}');
          if (selectedEmployeeId) localStorage.setItem('lastEmployeeId', selectedEmployeeId);
          setLocation(emp.role === 'admin' ? '/admin' : '/tables');
        })
        .catch(() => {
          setPin("");
          toast.error("PIN incorrecto");
        })
        .finally(() => setIsPending(false));
    }
  }, [pin, selectedEmployeeId, isPending, login, setLocation]);

  const handlePinPress = (num: number) => {
    if (pin.length < 4) setPin((prev) => prev + num);
  };

  const handlePinDelete = () => setPin((prev) => prev.slice(0, -1));

  const [empFilter, setEmpFilter] = useState('');
  const selectedEmployee = employees?.find(e => e.id === selectedEmployeeId);

  const visibleEmployees = useMemo(() => {
    const q = empFilter.trim().toLowerCase();
    return q ? (employees ?? []).filter(e => e.name.toLowerCase().includes(q)) : (employees ?? []);
  }, [employees, empFilter]);

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      {/* ── Left: Employee Selection ─────────────────────────────────────────── */}
      <div className="flex-1 p-6 lg:p-12 overflow-y-auto flex flex-col">
        {/* Logo + heading */}
        <div className="mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-xl mb-5 shadow-md">
            P
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Seleccionar perfil</h1>
          <p className="text-muted-foreground mt-1 text-base">Toca tu nombre para iniciar turno.</p>
        </div>

        {loadingEmployees ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Search bar — only shown when >6 employees */}
            {(employees?.length ?? 0) > 6 && (
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  value={empFilter}
                  autoFocus
                  onChange={e => setEmpFilter(e.target.value)}
                  placeholder="Buscar empleado…"
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {empFilter && (
                  <button onClick={() => setEmpFilter('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Employee grid — explicit bg/border so it's visible in dark mode */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleEmployees.map((emp) => {
                const isSelected = selectedEmployeeId === emp.id;
                return (
                  <button
                    key={emp.id}
                    onClick={() => { setSelectedEmployeeId(emp.id); setPin(""); }}
                    style={{
                      background: isSelected ? 'rgba(217,119,54,0.15)' : 'rgba(255,255,255,0.06)',
                      borderColor: isSelected ? '#d97736' : 'rgba(255,255,255,0.15)',
                    }}
                    className={`
                      flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all active:scale-95
                    `}
                  >
                    <div
                      style={{
                        background: isSelected ? '#d97736' : 'rgba(255,255,255,0.12)',
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.85)',
                      }}
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-3"
                    >
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      style={{ color: isSelected ? '#d97736' : 'rgba(255,255,255,0.9)' }}
                      className="font-semibold text-base text-center leading-tight"
                    >
                      {emp.name}
                    </span>
                    {(emp as any).role && (
                      <span className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {(emp as any).role}
                      </span>
                    )}
                  </button>
                );
              })}

              {visibleEmployees.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                  No se encontraron empleados
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Admin access link ─────────────────────────────────────────────── */}
        <div className="mt-auto pt-8">
          <button
            onClick={() => setLocation('/admin')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <ShieldCheck size={15} />
            Acceso administrador
          </button>
        </div>
      </div>

      {/* ── Right: PIN Pad ───────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[460px] bg-card border-t lg:border-t-0 lg:border-l border-border flex flex-col shadow-2xl relative z-10">
        <div className="flex-1 flex flex-col justify-center px-8 py-10">

          {/* Status row */}
          <div className="text-center mb-8 h-20 flex flex-col items-center justify-end">
            {selectedEmployee ? (
              <>
                <p className="text-muted-foreground mb-3 text-sm">
                  PIN para <span className="font-semibold text-foreground">{selectedEmployee.name}</span>
                </p>
                <div className="flex justify-center gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-5 h-5 rounded-full transition-all duration-200 ${i < pin.length ? "bg-primary scale-110 shadow-[0_0_10px_rgba(217,119,54,0.5)]" : "bg-secondary"}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Selecciona un perfil primero</p>
            )}
          </div>

          {/* PIN grid */}
          <div className={`grid grid-cols-3 gap-3 transition-opacity duration-300 ${!selectedEmployee ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <PinKey
                key={num}
                onPress={() => handlePinPress(num)}
                className="aspect-square bg-secondary text-secondary-foreground rounded-2xl flex items-center justify-center text-3xl font-mono shadow-sm"
              >
                {num}
              </PinKey>
            ))}
            <div className="aspect-square" />
            <PinKey
              onPress={() => handlePinPress(0)}
              className="aspect-square bg-secondary text-secondary-foreground rounded-2xl flex items-center justify-center text-3xl font-mono shadow-sm"
            >
              0
            </PinKey>
            <PinKey
              onPress={handlePinDelete}
              className="aspect-square bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center shadow-sm"
            >
              <Delete size={28} strokeWidth={2.5} />
            </PinKey>
          </div>

          {isPending && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center rounded-l-3xl">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
