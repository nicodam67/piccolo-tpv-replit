import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetZones,
  useGetZoneTables,
  useOpenTable,
  getGetZoneTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetAllTablesQueryKey
} from "@workspace/api-client-react";
import { LogOut, Loader2, Monitor, Users } from "lucide-react";
import { toast } from "sonner";

export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [employeeName, setEmployeeName] = useState<string>("");
  const [employeeRole, setEmployeeRole] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const empStr = localStorage.getItem("employee");
    if (!token) {
      setLocation("/");
    } else if (empStr) {
      try {
        const emp = JSON.parse(empStr);
        setEmployeeName(emp.name);
        setEmployeeRole(emp.role ?? "");
      } catch (e) {
        // ignore parse error
      }
    }
  }, [setLocation]);

  const isAdmin = employeeRole === "admin";

  const { data: summary } = useGetDashboardSummary();
  const { data: zones, isLoading: loadingZones } = useGetZones();
  const [activeZone, setActiveZone] = useState<string | null>(null);

  useEffect(() => {
    if (zones?.length && !activeZone) {
      setActiveZone(zones[0].id);
    }
  }, [zones, activeZone]);

  const { data: tables, isLoading: loadingTables } = useGetZoneTables(activeZone!, { 
    query: { 
      enabled: !!activeZone, 
      queryKey: getGetZoneTablesQueryKey(activeZone!) 
    } 
  });

  const openTable = useOpenTable();

  const handleTableClick = (table: any) => {
    if (table.status === 'free') {
      openTable.mutate(
        { tableId: table.id }, 
        { 
          onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(activeZone!) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
            setLocation(`/pedido/${table.id}/${data.order.id}`);
          },
          onError: () => toast.error("Could not open table") 
        }
      );
    } else {
      setLocation(`/pedido/${table.id}/current`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("employee");
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Summary Bar */}
      <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border shadow-sm shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
            P
          </div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline-block">Piccolo</span>
        </div>

        {summary && (
          <div className="flex items-center gap-6 text-sm font-medium bg-background px-4 py-2 rounded-full border border-border">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total</span>
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">{summary.totalTables}</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <div className="flex items-center gap-2">
              <span className="text-[#c05c4a]">Occupied</span>
              <span className="px-2 py-0.5 rounded bg-[#c05c4a]/10 text-[#c05c4a] font-mono">{summary.occupiedTables}</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <div className="flex items-center gap-2">
              <span className="text-[#61895f]">Free</span>
              <span className="px-2 py-0.5 rounded bg-[#61895f]/10 text-[#61895f] font-mono">{summary.freeTables}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Admin-only tools */}
          {isAdmin && (
            <>
              <button
                onClick={() => setLocation('/kds')}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Pantalla de cocina"
              >
                <Monitor size={15} />
                <span className="hidden sm:inline">KDS</span>
              </button>
              <button
                onClick={() => setLocation('/caja')}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Gestión de caja"
              >
                <span className="text-base leading-none">🗃</span>
                <span className="hidden sm:inline">Caja</span>
              </button>
            </>
          )}

          {/* Employee chip */}
          <div className="flex items-center gap-2 text-sm font-medium pl-1">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-secondary-foreground">
                {employeeName.charAt(0) || "U"}
              </div>
              {isAdmin && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[8px] font-black text-white leading-none">
                  A
                </span>
              )}
            </div>
            <div className="hidden md:flex flex-col leading-none">
              <span className="font-semibold">{employeeName}</span>
              <span className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${isAdmin ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {employeeRole || 'staff'}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-90"
            title="Cerrar sesión"
          >
            <LogOut size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Zone Tabs */}
      <div className="bg-card border-b border-border shrink-0 px-4 pt-4 pb-0 overflow-x-auto hide-scrollbar">
        {loadingZones ? (
          <div className="flex gap-2 pb-4">
            {[1, 2, 3].map(i => <div key={i} className="w-24 h-10 rounded-t-xl bg-secondary animate-pulse" />)}
          </div>
        ) : (
          <div className="flex gap-2">
            {zones?.map((zone) => {
              const isActive = activeZone === zone.id;
              return (
                <button
                  key={zone.id}
                  onClick={() => setActiveZone(zone.id)}
                  className={`
                    px-6 py-3 rounded-t-xl font-semibold text-sm transition-all whitespace-nowrap
                    ${isActive 
                      ? "bg-background text-primary border-t-2 border-primary shadow-[0_-4px_10px_rgba(0,0,0,0.05)]" 
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }
                  `}
                >
                  {zone.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Table Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {loadingTables ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : tables?.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <span className="font-bold text-2xl">!</span>
            </div>
            <p className="text-lg">No tables configured for this zone.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-6">
            {tables?.map((table) => {
              const isFree = table.status === "free";
              const isOpening = openTable.isPending && openTable.variables?.tableId === table.id;
              const isBusy = isOpening;

              return (
                <button
                  key={table.id}
                  disabled={isBusy}
                  onClick={() => handleTableClick(table)}
                  className={`
                    relative aspect-square rounded-2xl flex flex-col items-center justify-center p-4 
                    transition-all active:scale-[0.97] border-2 shadow-sm
                    ${isFree 
                      ? "bg-[#253324] border-[#3f573c] hover:border-[#61895f] text-[#dcecdb]" 
                      : "bg-[#45201a] border-[#6b3127] hover:border-[#c05c4a] text-[#f5dcd8]"
                    }
                    ${isBusy ? "opacity-70 pointer-events-none" : ""}
                  `}
                >
                  {isBusy ? (
                    <Loader2 className="w-8 h-8 animate-spin opacity-50" />
                  ) : (
                    <>
                      <span className="text-3xl font-bold tracking-tighter mb-1">{table.name}</span>
                      <div className={`
                        flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
                        ${isFree ? "bg-[#182218] text-[#90ad8e]" : "bg-[#2c130f] text-[#c98073]"}
                      `}>
                        <Users size={12} strokeWidth={3} />
                        {table.capacity}
                      </div>
                    </>
                  )}
                  
                  {/* Status Indicator Dot */}
                  <div className={`
                    absolute top-3 right-3 w-2.5 h-2.5 rounded-full
                    ${isFree ? "bg-[#61895f] shadow-[0_0_8px_#61895f]" : "bg-[#c05c4a] shadow-[0_0_8px_#c05c4a]"}
                  `} />
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
