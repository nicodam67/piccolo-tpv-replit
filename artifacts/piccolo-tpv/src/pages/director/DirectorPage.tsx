import { useState, useEffect } from "react";
import DirectorHoy from "./DirectorHoy";
import DirectorVentas from "./DirectorVentas";
import DirectorRentabilidad from "./DirectorRentabilidad";
import DirectorCostos from "./DirectorCostos";
import DirectorObjetivos from "./DirectorObjetivos";
import DirectorCaja from "./DirectorCaja";
import DirectorPersonal from "./DirectorPersonal";
import DirectorStock from "./DirectorStock";
import DirectorReservas from "./DirectorReservas";
import DirectorCocina from "./DirectorCocina";
import DirectorReparto from "./DirectorReparto";
import DirectorCRM from "./DirectorCRM";
import DirectorAlertas from "./DirectorAlertas";
import DirectorPrevision from "./DirectorPrevision";
import DirectorInformes from "./DirectorInformes";

type Tab =
  | "hoy" | "ventas" | "rentabilidad" | "costos" | "objetivos"
  | "caja" | "personal" | "stock" | "reservas" | "cocina"
  | "reparto" | "crm" | "alertas" | "prevision" | "informes";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hoy",          label: "Hoy",          icon: "📊" },
  { id: "ventas",       label: "Ventas",        icon: "💶" },
  { id: "rentabilidad", label: "Rentabilidad",  icon: "📈" },
  { id: "costos",       label: "Costes",        icon: "🧾" },
  { id: "objetivos",    label: "Objetivos",     icon: "🎯" },
  { id: "caja",         label: "Caja",          icon: "🏧" },
  { id: "personal",     label: "Personal",      icon: "👥" },
  { id: "stock",        label: "Stock",         icon: "📦" },
  { id: "reservas",     label: "Reservas",      icon: "📅" },
  { id: "cocina",       label: "Cocina",        icon: "🍳" },
  { id: "reparto",      label: "Reparto",       icon: "🛵" },
  { id: "crm",          label: "Clientes",      icon: "❤️" },
  { id: "alertas",      label: "Alertas",       icon: "🔔" },
  { id: "prevision",    label: "Previsión",     icon: "🔭" },
  { id: "informes",     label: "Informes",      icon: "📋" },
];

export default function DirectorPage() {
  const [activeTab, setActiveTab] = useState<Tab>("hoy");
  const [openAlerts, setOpenAlerts] = useState(0);

  // Fetch open alert count for badge
  useEffect(() => {
    fetch("/api/director/alerts?status=open&limit=1", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown[]) => {
        if (Array.isArray(data)) setOpenAlerts(data.length > 0 ? 99 : 0);
      })
      .catch(() => {});

    // Poll for alerts every 2 minutes
    const iv = setInterval(() => {
      fetch("/api/director/alerts?status=open&limit=99", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((data: unknown[]) => { if (Array.isArray(data)) setOpenAlerts(data.length); })
        .catch(() => {});
    }, 120_000);
    return () => clearInterval(iv);
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case "hoy":          return <DirectorHoy />;
      case "ventas":       return <DirectorVentas />;
      case "rentabilidad": return <DirectorRentabilidad />;
      case "costos":       return <DirectorCostos />;
      case "objetivos":    return <DirectorObjetivos />;
      case "caja":         return <DirectorCaja />;
      case "personal":     return <DirectorPersonal />;
      case "stock":        return <DirectorStock />;
      case "reservas":     return <DirectorReservas />;
      case "cocina":       return <DirectorCocina />;
      case "reparto":      return <DirectorReparto />;
      case "crm":          return <DirectorCRM />;
      case "alertas":      return <DirectorAlertas />;
      case "prevision":    return <DirectorPrevision />;
      case "informes":     return <DirectorInformes />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => history.back()} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">Panel de Dirección</h1>
            <p className="text-xs text-gray-400 mt-0.5">Rentabilidad, previsiones y alertas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {openAlerts > 0 && (
            <button
              onClick={() => setActiveTab("alertas")}
              className="relative flex items-center gap-1.5 bg-red-900/50 border border-red-700 text-red-300 px-3 py-1.5 rounded-lg text-sm hover:bg-red-800/50 transition-colors"
            >
              <span>🔔</span>
              <span>{openAlerts} alertas</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab navigation — horizontal scroll on mobile */}
      <div className="bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <div className="flex min-w-max px-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === "alertas" && openAlerts > 0 && (
                <span className="bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {openAlerts > 99 ? "99+" : openAlerts}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {renderTab()}
      </div>
    </div>
  );
}
