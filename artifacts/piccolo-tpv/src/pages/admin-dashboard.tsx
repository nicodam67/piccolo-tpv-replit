import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useLocation } from 'wouter';
import {
  UtensilsCrossed,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Clock,
  ChevronRight,
  TrendingUp,
  Coffee,
  Search,
  X as XIcon,
  QrCode,
  Wrench,
  ShieldCheck,
  Fingerprint,
  HardDrive,
  Zap,
  UtensilsCrossed as ForkIcon,
} from 'lucide-react';
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, customFetch } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';

// ─── Module definitions ───────────────────────────────────────────────────────
interface ModuleCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  ready: boolean;
  accent: string;
  border: string;
  iconBg: string;
  iconColor: string;
  badge?: number;
  glow: string;
}

// ─── 8 main modules ───────────────────────────────────────────────────────────
const MODULES: ModuleCard[] = [
  {
    id: 'operaciones',
    icon: <UtensilsCrossed size={28} />,
    title: 'Operaciones',
    description: 'TPV · caja · salas · reservas · KDS',
    href: '/operaciones',
    ready: true,
    accent: 'rgba(237,135,76,0.07)',
    border: 'rgba(237,135,76,0.28)',
    iconBg: 'rgba(237,135,76,0.15)',
    iconColor: '#ed874c',
    glow: 'rgba(237,135,76,0.12)',
  },
  {
    id: 'carta-cocina',
    icon: <QrCode size={28} />,
    title: 'Carta y Cocina',
    description: 'QR Menú · productos · escandallos · costes',
    href: '/carta-cocina',
    ready: true,
    accent: 'rgba(14,165,233,0.07)',
    border: 'rgba(14,165,233,0.28)',
    iconBg: 'rgba(14,165,233,0.15)',
    iconColor: '#0ea5e9',
    glow: 'rgba(14,165,233,0.12)',
  },
  {
    id: 'clientes-pedidos',
    icon: <Users size={28} />,
    title: 'Clientes y Pedidos',
    description: 'CRM · fidelización · pedidos online · reparto',
    href: '/clientes-pedidos',
    ready: true,
    accent: 'rgba(129,140,248,0.07)',
    border: 'rgba(129,140,248,0.28)',
    iconBg: 'rgba(129,140,248,0.15)',
    iconColor: '#818cf8',
    glow: 'rgba(129,140,248,0.12)',
  },
  {
    id: 'personal',
    icon: <Fingerprint size={28} />,
    title: 'Personal y Fichaje',
    description: 'Empleados · turnos · fichajes · NFC',
    href: '/personal',
    ready: true,
    accent: 'rgba(20,184,166,0.07)',
    border: 'rgba(20,184,166,0.28)',
    iconBg: 'rgba(20,184,166,0.15)',
    iconColor: '#14b8a6',
    glow: 'rgba(20,184,166,0.12)',
  },
  {
    id: 'administracion',
    icon: <BarChart3 size={28} />,
    title: 'Administración',
    description: 'Informes · dirección · fiscalidad · control',
    href: '/administracion',
    ready: true,
    accent: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.28)',
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#10b981',
    glow: 'rgba(16,185,129,0.12)',
  },
  {
    id: 'hardware',
    icon: <Wrench size={28} />,
    title: 'Hardware e Instalación',
    description: 'Impresoras · KDS · dispositivos · red',
    href: '/hardware',
    ready: true,
    accent: 'rgba(6,182,212,0.07)',
    border: 'rgba(6,182,212,0.28)',
    iconBg: 'rgba(6,182,212,0.15)',
    iconColor: '#06b6d4',
    glow: 'rgba(6,182,212,0.12)',
  },
  {
    id: 'sistema',
    icon: <ShieldCheck size={28} />,
    title: 'Sistema',
    description: 'Diagnóstico · seguridad · copias · mantenimiento',
    href: '/sistema',
    ready: true,
    accent: 'rgba(139,92,246,0.07)',
    border: 'rgba(139,92,246,0.28)',
    iconBg: 'rgba(139,92,246,0.15)',
    iconColor: '#8b5cf6',
    glow: 'rgba(139,92,246,0.12)',
  },
  {
    id: 'configuracion',
    icon: <Settings size={28} />,
    title: 'Configuración',
    description: 'Preferencias generales del sistema',
    href: '/configuracion',
    ready: true,
    accent: 'rgba(130,130,145,0.07)',
    border: 'rgba(130,130,145,0.22)',
    iconBg: 'rgba(130,130,145,0.12)',
    iconColor: '#8282a0',
    glow: 'rgba(130,130,145,0.10)',
  },
];

// ─── Search index — includes all internal module items ────────────────────────
interface SearchItem {
  title: string;
  path: string;    // display breadcrumb
  href: string;
  keywords: string;
}

const SEARCH_INDEX: SearchItem[] = [
  // Operaciones
  { title: 'TPV',              path: 'Operaciones › Servicio', href: '/tables',                keywords: 'tpv mesas pedidos comandas servicio cobrar' },
  { title: 'Editar salas',     path: 'Operaciones › Servicio', href: '/configuracion',          keywords: 'salas distribuciones planos editor' },
  { title: 'Reservas',         path: 'Operaciones › Servicio', href: '/reservas',               keywords: 'reservas agenda comensales' },
  { title: 'Caja',             path: 'Operaciones › Cobro',    href: '/caja',                   keywords: 'caja apertura cierre arqueo cobro efectivo' },
  { title: 'Caja automática',  path: 'Operaciones › Cobro',    href: '/admin/caja-automatica',  keywords: 'caja automatica cash management dispositivo' },
  { title: 'KDS',              path: 'Operaciones › Cocina',   href: '/kds/cocina',             keywords: 'kds cocina pantalla produccion comandas' },
  // Carta y Cocina — QR Menú
  { title: 'QR Menú',          path: 'Carta y Cocina › QR Menú', href: '/admin/qr-menu',       keywords: 'qr menu carta digital online branding publicacion horarios' },
  { title: 'Categorías',       path: 'Carta y Cocina › QR Menú', href: '/categorias',          keywords: 'categorias familias carta secciones' },
  { title: 'Productos',        path: 'Carta y Cocina › QR Menú', href: '/productos',            keywords: 'productos carta escandallos precios' },
  { title: 'Modificadores',    path: 'Carta y Cocina › QR Menú', href: '/modificadores',        keywords: 'modificadores opciones variantes alergenos extras' },
  { title: 'Branding',         path: 'Carta y Cocina › QR Menú', href: '/admin/branding',      keywords: 'branding colores tipografias imagen logo' },
  { title: 'Imprimir carta',   path: 'Carta y Cocina › QR Menú', href: '/carta/imprimir',      keywords: 'imprimir carta pdf fisico' },
  // Carta y Cocina — Food Cost
  { title: 'Food Cost',        path: 'Carta y Cocina › Food Cost', href: '/admin/food-cost',    keywords: 'food cost costes rentabilidad dashboard' },
  { title: 'Ingredientes',     path: 'Carta y Cocina › Food Cost', href: '/ingredientes',       keywords: 'ingredientes materias primas alergenos' },
  { title: 'Escandallos',      path: 'Carta y Cocina › Food Cost', href: '/productos',          keywords: 'escandallos recetas gramaje coste plato' },
  { title: 'Subrecetas',       path: 'Carta y Cocina › Food Cost', href: '/admin/subrecetas',   keywords: 'subrecetas preelaborados semipreparados' },
  { title: 'Proveedores',      path: 'Carta y Cocina › Food Cost', href: '/admin/proveedores',  keywords: 'proveedores suministros comparacion precios' },
  { title: 'Pedidos de compra', path: 'Carta y Cocina › Food Cost', href: '/admin/pedidos-compra', keywords: 'pedidos compra aprovisionamiento' },
  { title: 'Inventario físico', path: 'Carta y Cocina › Food Cost', href: '/admin/inventario/fisico', keywords: 'inventario stock fisico conteo' },
  { title: 'Mermas',           path: 'Carta y Cocina › Food Cost', href: '/admin/mermas',       keywords: 'mermas desperdicios perdidas caducidad' },
  { title: 'Almacenes',        path: 'Carta y Cocina › Food Cost', href: '/admin/almacenes',    keywords: 'almacenes ubicaciones stock' },
  { title: 'Lotes y caducidades', path: 'Carta y Cocina › Food Cost', href: '/admin/lotes-caducidades', keywords: 'lotes caducidades trazabilidad' },
  // Clientes y Pedidos
  { title: 'CRM',              path: 'Clientes y Pedidos › Clientes', href: '/admin/crm',       keywords: 'crm clientes historial contactos' },
  { title: 'Fidelización',     path: 'Clientes y Pedidos › Clientes', href: '/admin/crm',       keywords: 'fidelizacion puntos programa lealtad recompensas' },
  { title: 'Tarjetas regalo',  path: 'Clientes y Pedidos › Clientes', href: '/admin/crm',       keywords: 'tarjetas regalo gift card bono' },
  { title: 'Pedidos Online',   path: 'Clientes y Pedidos › Pedidos Online', href: '/admin/online-orders-config', keywords: 'pedidos online delivery recogida zonas horarios configuracion' },
  { title: 'Bandeja de pedidos', path: 'Clientes y Pedidos › Pedidos Online', href: '/online-orders', keywords: 'bandeja pedidos confirmar rechazar asignar' },
  { title: 'Repartidores',     path: 'Clientes y Pedidos › Pedidos Online', href: '/admin/repartidores', keywords: 'repartidores delivery reparto gestión' },
  { title: 'Informes online',  path: 'Clientes y Pedidos › Informes', href: '/admin/online-reports', keywords: 'informes online ventas canal delivery' },
  // Personal y Fichaje
  { title: 'Empleados',        path: 'Personal y Fichaje › Empleados', href: '/personal/empleados', keywords: 'empleados altas bajas roles pin permisos foto' },
  { title: 'NFC · Tarjetas',   path: 'Personal y Fichaje › Empleados', href: '/personal/empleados', keywords: 'nfc tarjetas contactless fichaje' },
  { title: 'Fichaje',          path: 'Personal y Fichaje › Fichaje',   href: '/personal/fichaje',   keywords: 'fichaje entrada salida pausa registros' },
  { title: 'Turnos',           path: 'Personal y Fichaje › Fichaje',   href: '/personal/fichaje/turnos', keywords: 'turnos planificacion horarios' },
  { title: 'Tablet fichaje',   path: 'Personal y Fichaje › Fichaje',   href: '/fichaje/tablet',         keywords: 'tablet fichaje kiosko nfc' },
  // Administración
  { title: 'Informes de ventas', path: 'Administración › Informes', href: '/admin/informes',   keywords: 'informes ventas camareros iva descuentos anulaciones exportacion excel pdf' },
  { title: 'IVA',              path: 'Administración › Informes',    href: '/admin/informes',   keywords: 'iva impuesto base imponible cuota fiscal' },
  { title: 'Panel de Dirección', path: 'Administración › Dirección', href: '/admin/director',   keywords: 'direccion kpis rentabilidad previsiones objetivos comparativas' },
  { title: 'VERI*FACTU',       path: 'Administración › Fiscalidad',  href: '/admin/verifactu',  keywords: 'verifactu fiscal facturas registros encadenamiento qr fiscal serie' },
  { title: 'Permisos por rol', path: 'Administración › Auditoría',   href: '/admin/permisos',   keywords: 'permisos rol acceso empleados matriz granular' },
  // Hardware e Instalación
  { title: 'Impresoras',       path: 'Hardware e Instalación › Impresión', href: '/admin/impresoras',      keywords: 'impresoras configurar enrutamiento plantilla ticket' },
  { title: 'Cola de impresión', path: 'Hardware e Instalación › Impresión', href: '/admin/cola-impresion', keywords: 'cola impresion pendientes errores reimpresion' },
  { title: 'Prueba de impresión', path: 'Hardware e Instalación › Impresión', href: '/admin/prueba-impresion', keywords: 'prueba impresion test asistente verificar' },
  { title: 'Estaciones KDS',   path: 'Hardware e Instalación › Pantallas KDS', href: '/admin/kds-stations', keywords: 'kds estaciones pantallas ips ping produccion' },
  { title: 'Dispositivos',     path: 'Hardware e Instalación › Dispositivos', href: '/admin/devices',       keywords: 'dispositivos tablets ips mac red inventario' },
  { title: 'Instalación',      path: 'Hardware e Instalación › Dispositivos', href: '/admin/instalacion',   keywords: 'instalacion hardware red manuales arquitectura' },
  { title: 'QR de mesas',      path: 'Hardware e Instalación › Dispositivos', href: '/admin/instalacion/qr', keywords: 'qr mesas impresion generacion' },
  { title: 'Caja automática',  path: 'Hardware e Instalación › Caja',         href: '/admin/caja-automatica', keywords: 'caja automatica cash management' },
  // Sistema
  { title: 'Diagnóstico técnico', path: 'Sistema › Diagnóstico', href: '/admin/diagnostics',  keywords: 'diagnostico eventos mantenimiento alertas tecnico' },
  { title: 'Estado del sistema',  path: 'Sistema › Diagnóstico', href: '/admin/sistema',       keywords: 'estado sistema modulos hallazgos go-live informe' },
  { title: 'Salud del sistema',   path: 'Sistema › Seguridad',   href: '/admin/salud',         keywords: 'salud semaforos bd impresoras backups cola offline' },
  { title: 'Copias de seguridad', path: 'Sistema › Datos',       href: '/admin/backup',        keywords: 'copias seguridad backup restauracion exportacion programacion' },
  { title: 'Datos de demostración', path: 'Sistema › Datos',     href: '/admin/datos-demo',    keywords: 'datos demo simulacion purgar limpieza go-live is_demo' },
  { title: 'Asistente de configuración', path: 'Sistema › Mantenimiento', href: '/setup',      keywords: 'asistente configuracion puesta marcha guia 16 pasos simulacion go-live' },
  // Configuración
  { title: 'Configuración general', path: 'Configuración', href: '/configuracion', keywords: 'configuracion preferencias restaurante idioma moneda impuestos series seguridad' },
];

// ─── Clock hook ───────────────────────────────────────────────────────────────
function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [employeeName, setEmployeeName] = useState('Admin');
  const [moduleSearch, setModuleSearch] = useState('');
  const now = useNow();
  const { data: summary, refetch: refetchSummary } = useGetDashboardSummary({ query: { refetchInterval: 30000, queryKey: getGetDashboardSummaryQueryKey() } });

  // Today's reservations count for the badge on Operaciones
  const todayDate = now.toISOString().slice(0, 10);
  const { data: todayReservations = [] } = useQuery<{ id: string; status: string }[]>({
    queryKey: ['reservations-today-badge', todayDate],
    queryFn: () => customFetch(`/api/reservations?date=${todayDate}`),
    refetchInterval: 60000,
  });
  const reservasBadge = todayReservations.filter((r: { status: string }) => r.status !== 'cancelled' && r.status !== 'noshow').length;

  useEffect(() => {
    if (user?.name) setEmployeeName(user.name);
  }, [user]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refetchSummary();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchSummary]);

  const handleLogout = () => { void logout(); };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const occupancyPct = summary && summary.totalTables > 0
    ? Math.round((summary.occupiedTables / summary.totalTables) * 100)
    : 0;

  // ─── Search filtering ────────────────────────────────────────────────────
  const q = moduleSearch.trim().toLowerCase();
  const filteredModules = useMemo(() =>
    q ? MODULES.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    ) : MODULES,
    [q]
  );
  const filteredSearch = useMemo(() =>
    q ? SEARCH_INDEX.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.path.toLowerCase().includes(q) ||
      s.keywords.toLowerCase().includes(q)
    ) : [],
    [q]
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="h-16 shrink-0 flex items-center px-4 sm:px-8 bg-card border-b border-border shadow-sm z-10 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-base shadow">
            <Coffee size={18} />
          </div>
          <span className="font-black text-lg tracking-tight hidden sm:block">Piccolo TPV</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-black uppercase tracking-widest border border-amber-500/30">
            Admin
          </span>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-1.5 text-muted-foreground text-sm font-mono">
          <Clock size={13} />
          <span>{timeStr}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-black text-primary text-sm">
                {employeeName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[7px] font-black text-white leading-none">A</span>
            </div>
            <span className="hidden md:block text-sm font-semibold">{employeeName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-90"
            title="Cerrar sesión"
          >
            <LogOut size={17} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 sm:px-8 lg:px-10 py-6 max-w-6xl mx-auto w-full">

        {/* Greeting */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black leading-tight">
              {greeting}, {employeeName.split(' ')[0]} 👋
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm capitalize">{dateStr}</p>
          </div>
        </div>

        {/* ── Live stats ── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Mesas totales" value={summary.totalTables} icon={<ForkIcon size={16} />} color="#ed874c" bg="rgba(237,135,76,0.08)" border="rgba(237,135,76,0.2)" />
            <StatCard label="Ocupadas" value={summary.occupiedTables} icon={<TrendingUp size={16} />} color="#c05c4a" bg="rgba(192,92,74,0.08)" border="rgba(192,92,74,0.2)" sub={`${occupancyPct}% ocupación`} />
            <StatCard label="Libres" value={summary.freeTables} icon={<ForkIcon size={16} />} color="#61895f" bg="rgba(97,137,95,0.08)" border="rgba(97,137,95,0.2)" />
            <StatCard label="F. de servicio" value={(summary.totalTables ?? 0) - (summary.occupiedTables ?? 0) - (summary.freeTables ?? 0)} icon={<Settings size={16} />} color="#8282a0" bg="rgba(130,130,160,0.08)" border="rgba(130,130,160,0.2)" />
          </div>
        )}

        {/* ── Quick-access strip ── */}
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Accesos directos</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: 'Abrir TPV',     href: '/tables',              icon: <UtensilsCrossed size={18} />, color: '#ed874c', bg: 'rgba(237,135,76,0.12)' },
              { label: 'Abrir Caja',    href: '/caja',                icon: <span className="text-xl leading-none">💵</span>, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
              { label: 'KDS Cocina',    href: '/kds/cocina',          icon: <span className="text-xl leading-none">📺</span>, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
              { label: 'Administración', href: '/administracion',     icon: <BarChart3 size={18} />,        color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
              { label: 'Diagnóstico',   href: '/admin/diagnostics',   icon: <Zap size={18} />,              color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
              { label: 'Copia seguridad', href: '/admin/backup',      icon: <HardDrive size={18} />,        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
              { label: 'QR Mesas',      href: '/admin/instalacion/qr', icon: <QrCode size={18} />,         color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
            ].map(sc => (
              <button key={sc.label} onClick={() => setLocation(sc.href)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all text-center group shrink-0 min-w-[70px] sm:min-w-0"
                style={{ background: sc.bg }}>
                <span style={{ color: sc.color }} className="transition-transform group-hover:scale-110 duration-150">
                  {sc.icon}
                </span>
                <span className="text-[11px] font-semibold leading-tight whitespace-nowrap">{sc.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Module search ── */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={moduleSearch}
            onChange={e => setModuleSearch(e.target.value)}
            placeholder="Buscar módulo o función… (ej: impresora, NFC, IVA, backup)"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {moduleSearch && (
            <button onClick={() => setModuleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* ── Module grid / search results ── */}
        {q ? (
          <div className="space-y-6">
            {/* Main module matches */}
            {filteredModules.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Módulos principales</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {filteredModules.map(card => (
                    <ModuleButton
                      key={card.id}
                      card={{ ...card, badge: card.id === 'operaciones' && reservasBadge > 0 ? reservasBadge : undefined }}
                      onClick={() => setLocation(card.href)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Internal items */}
            {filteredSearch.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Funciones internas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredSearch.map(item => (
                    <SearchResultItem key={item.path + item.title} item={item} onClick={() => setLocation(item.href)} />
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {filteredModules.length === 0 && filteredSearch.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <p>Sin resultados para &ldquo;{moduleSearch}&rdquo;</p>
                <button onClick={() => setModuleSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Módulos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MODULES.map(card => (
                <ModuleButton
                  key={card.id}
                  card={{ ...card, badge: card.id === 'operaciones' && reservasBadge > 0 ? reservasBadge : undefined }}
                  onClick={() => setLocation(card.href)}
                />
              ))}
            </div>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground/40 mt-10 font-medium tracking-wide">
          Piccolo TPV · Panel de Administración
        </p>
      </main>
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, color, bg, border, sub,
}: {
  label: string; value: number; icon: React.ReactNode;
  color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2 border" style={{ background: bg, borderColor: border }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
        <span style={{ color }} className="opacity-70">{icon}</span>
      </div>
      <span className="text-3xl font-black leading-none" style={{ color }}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground font-semibold">{sub}</span>}
    </div>
  );
}

// ─── SearchResultItem ─────────────────────────────────────────────────────────
function SearchResultItem({ item, onClick }: { item: SearchItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/40 transition-all active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm truncate">{item.title}</p>
        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{item.path}</p>
      </div>
      <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-80 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150" />
    </button>
  );
}

// ─── ModuleButton ─────────────────────────────────────────────────────────────
function ModuleButton({ card, onClick }: { card: ModuleCard; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!card.ready}
      className={`group relative text-left rounded-2xl border p-5 flex flex-col gap-3.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${card.ready
          ? 'hover:scale-[1.025] hover:shadow-2xl active:scale-[0.975] cursor-pointer'
          : 'cursor-default opacity-50 pointer-events-none'
        }`}
      style={{ background: card.accent, borderColor: card.border }}
    >
      {/* Count badge */}
      {card.ready && card.badge !== undefined && (
        <span className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[11px] font-black rounded-full bg-primary text-primary-foreground shadow-sm">
          {card.badge}
        </span>
      )}

      {/* Glow on hover */}
      {card.ready && (
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 1px ${card.border}, 0 8px 32px ${card.glow}` }}
        />
      )}

      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
        style={{ background: card.iconBg, color: card.iconColor }}
      >
        {card.icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <h2 className="text-[15px] font-black leading-tight">{card.title}</h2>
          {card.ready && (
            <ChevronRight size={13} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-80 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
      </div>
    </button>
  );
}
