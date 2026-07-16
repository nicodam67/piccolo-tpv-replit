import { useState } from "react";
import { useLocation } from "wouter";
import { Users, Briefcase, Upload, FileText, Calendar, BarChart2, ArrowLeft } from "lucide-react";
import HREmpleados from "./HREmpleados";
import HRCatalogos from "./HRCatalogos";
import HRImport from "./HRImport";
import HRSolicitudes from "./HRSolicitudes";
import HRPeriodos from "./HRPeriodos";
import HRInformes from "./HRInformes";

type Tab = "empleados" | "catalogos" | "importacion" | "solicitudes" | "periodos" | "informes";

const TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "empleados", label: "Empleados", Icon: Users },
  { id: "catalogos", label: "Puestos", Icon: Briefcase },
  { id: "importacion", label: "Importación", Icon: Upload },
  { id: "solicitudes", label: "Solicitudes", Icon: FileText },
  { id: "periodos", label: "Periodos", Icon: Calendar },
  { id: "informes", label: "Informes", Icon: BarChart2 },
];

export default function HRPage() {
  const [activeTab, setActiveTab] = useState<Tab>("empleados");
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/admin")}
          className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold">Recursos Humanos</h1>
          <p className="text-xs text-gray-400">Gestión de empleados, fichaje e importación</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 flex overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "empleados" && <HREmpleados />}
        {activeTab === "catalogos" && <HRCatalogos />}
        {activeTab === "importacion" && <HRImport />}
        {activeTab === "solicitudes" && <HRSolicitudes />}
        {activeTab === "periodos" && <HRPeriodos />}
        {activeTab === "informes" && <HRInformes />}
      </div>
    </div>
  );
}
