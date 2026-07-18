/**
 * Vista general del módulo Food Cost — pantalla de inicio del módulo.
 */
import { useLocation } from "wouter";
import {
  Package, FlaskConical, Truck, ShoppingCart, Warehouse,
  Calculator, TrendingUp, BarChart3, Timer, ScanSearch,
} from "lucide-react";

const QUICK_LINKS = [
  { label: "Ingredientes",       icon: <Package size={22} />,       href: "/ingredientes",               desc: "Materias primas · costes · proveedores" },
  { label: "Escandallos",        icon: <FlaskConical size={22} />,  href: "/productos",                  desc: "Recetas · coste teórico · márgenes" },
  { label: "Proveedores",        icon: <Truck size={22} />,         href: "/admin/proveedores",          desc: "Fichas · catálogos · contactos" },
  { label: "Pedidos de compra",  icon: <ShoppingCart size={22} />,  href: "/admin/pedidos-compra",       desc: "Ciclo de vida · aprobación · propuesta" },
  { label: "Inventarios",        icon: <Warehouse size={22} />,     href: "/admin/inventario/fisico",    desc: "Recuento manual · ajuste automático" },
  { label: "Mermas",             icon: <Timer size={22} />,         href: "/admin/mermas",               desc: "Registro · causas · informes" },
  { label: "Escáner facturas",   icon: <ScanSearch size={22} />,    href: "/admin/escaner-facturas",     desc: "OCR · revisión · conciliación" },
  { label: "Costes",             icon: <Calculator size={22} />,    href: "/admin/simulador-precios",    desc: "Simula el PVP óptimo por margen" },
  { label: "Márgenes",           icon: <TrendingUp size={22} />,    href: "/admin/rentabilidad",         desc: "Food cost · alertas · objetivos" },
  { label: "Informes de stock",  icon: <BarChart3 size={22} />,     href: "/admin/inventario/informes",  desc: "Valor almacén · consumo · mermas" },
];

export default function FoodCostVista() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Food Cost</h1>
        <p className="mt-1 text-muted-foreground">
          Gestión integral de costes, compras, stock e ingredientes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUICK_LINKS.map(link => (
          <button
            key={link.href}
            onClick={() => navigate(link.href)}
            className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/40 transition-colors text-left group"
          >
            <span className="mt-0.5 text-amber-500 group-hover:scale-110 transition-transform">
              {link.icon}
            </span>
            <div>
              <p className="font-semibold text-foreground text-sm">{link.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{link.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
