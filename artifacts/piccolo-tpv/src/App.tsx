import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { AuthProvider } from './providers/AuthProvider';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { RequireRole } from './components/auth/RequireRole';
import { RequirePermission } from './components/auth/RequirePermission';

import Login from './pages/login';
import Tables from './pages/tables';
import Order from './pages/order';
import Kds from './pages/kds';
import Payment from './pages/payment';
import CashSession from './pages/cash-session';
import ZReport from './pages/z-report';
import XReport from './pages/x-report';
import Ticket from './pages/ticket';
import Configuracion from './pages/configuracion';
import ZoneEditor from './pages/zone-editor';
import AdminDashboard from './pages/admin-dashboard';
import Recogida from './pages/recogida';
import Prefactura from './pages/prefactura';
import Documentos from './pages/documentos';
import Fiscal from './pages/fiscal';
import Categorias from './pages/categorias';
import Productos from './pages/productos';
import Modificadores from './pages/modificadores';
import Ingredientes from './pages/ingredientes';
import Stock from './pages/stock';
import Carta from './pages/carta';
import CartaCategoria from './pages/carta-categoria';
import QrMenuPage from './pages/qr-menu/QrMenuPage';
import Reservations from './pages/reservations';
import CajaAutomatica from './pages/caja-automatica';
import CajaAutomaticaEstado from './pages/caja-automatica-estado';
import InventarioFisico from './pages/inventario-fisico';
import InformesStock from './pages/informes-stock';
import Subrecetas from './pages/subrecetas';
import Rentabilidad from './pages/rentabilidad';
import SimuladorPrecios from './pages/simulador-precios';
import Proveedores from './pages/proveedores';
import ComparacionPrecios from './pages/comparacion-precios';
import PedidosCompra from './pages/pedidos-compra';
import RecepcionMercancia from './pages/recepcion-mercancia';
import FacturasProveedor from './pages/facturas-proveedor';
import ConciliacionDocumental from './pages/conciliacion-documental';
import LotesCaducidades from './pages/lotes-caducidades';
import EscanerFacturas from './pages/escaner-facturas';
import RevisionFactura from './pages/revision-factura';
import ConciliacionFactura from './pages/conciliacion-factura';
import TrazabilidadLotes from './pages/trazabilidad-lotes';
import RetiradasLote from './pages/retirada-lote';
import HRPage from './pages/hr/HRPage';
import DirectorPage from './pages/director/DirectorPage';
import SetupWelcome from './pages/setup/SetupWelcome';
import SetupWizardPage from './pages/setup/SetupWizardPage';
import { OfflineBanner } from './components/OfflineBanner';
import BackupPage from './pages/backup/BackupPage';
import DiagnosticsPage from './pages/backup/DiagnosticsPage';
import DevicesPage from './pages/backup/DevicesPage';
import FichajeReloj from './pages/fichaje/FichajeReloj';
import FichajeLayout from './pages/fichaje/FichajeLayout';
import FichajePanelDiario from './pages/fichaje/FichajePanelDiario';
import FichajeRegistros from './pages/fichaje/FichajeRegistros';
import FichajeTurnos from './pages/fichaje/FichajeTurnos';
import FichajeAusencias from './pages/fichaje/FichajeAusencias';
import FichajeImportar from './pages/fichaje/FichajeImportar';
import FichajeInformes from './pages/fichaje/FichajeInformes';
import FichajeConfiguracion from './pages/fichaje/FichajeConfiguracion';
import FichajeEmpleados from './pages/fichaje/FichajeEmpleados';
import FichajePlaceholder from './pages/fichaje/FichajePlaceholder';
import Verifactu from './pages/verifactu';
import Crm from './pages/crm';
import Branding from './pages/branding';
import OnlineConfig from './pages/online-config';
import OnlineOrdersInbox from './pages/online-orders-inbox';
import DriverView from './pages/driver-view';
import OrderStatus from './pages/order-status';
import OnlineReports from './pages/online-reports';
import AdminImpresoras from './pages/admin-impresoras';
import AdminColaImpresion from './pages/admin-cola-impresion';
import AdminKdsStations from './pages/admin-kds-stations';
import AdminPrintTest from './pages/admin-print-test';
import AdminMermas from './pages/admin-mermas';
import AdminCategoriasIngredientes from './pages/admin-categorias-ingredientes';
import AdminAlmacenes from './pages/admin-almacenes';
import AdminTurnosReservas from './pages/admin-turnos-reservas';
import DeliveryPage from './pages/delivery';
import AdminRepartidores from './pages/admin-repartidores';
import MenuPage from './pages/menu';
import AdminSistema from './pages/admin-sistema';
import AdminSalud from './pages/admin-salud';
import AdminInstalacion from './pages/admin-instalacion';
import AdminInstalacionQR from './pages/admin-instalacion-qr';
import AdminPermisos from './pages/admin-permisos';
import AdminDatosDemo from './pages/admin-datos-demo';
import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Role sets — kept as constants to avoid inline array allocation per render
const ROLES_ANY_STAFF   = ['admin', 'manager', 'encargado', 'waiter'];
const ROLES_CASH        = ['admin', 'manager', 'encargado'];
const ROLES_MANAGER_UP  = ['admin', 'manager'];
const ROLES_ADMIN_ONLY  = ['admin'];

function Router() {
  return (
    <Switch>
      {/* ── Public routes (no auth required) ──────────────────────────────── */}
      <Route path="/" component={Login} />
      <Route path="/fichaje" component={FichajeReloj} />
      <Route path="/carta" component={Carta} />
      <Route path="/carta/categoria/:categoryId" component={CartaCategoria} />
      <Route path="/menu" component={MenuPage} />
      <Route path="/order-status/:orderNumber" component={OrderStatus} />
      <Route path="/driver/:courierId" component={DriverView} />
      <Route path="/setup" component={SetupWelcome} />
      <Route path="/setup/:sessionId/:step" component={SetupWizardPage} />

      {/* ── Any authenticated staff ────────────────────────────────────────── */}
      <Route path="/tables">
        <ProtectedRoute><Tables /></ProtectedRoute>
      </Route>
      <Route path="/pedido/:tableId/:orderId">
        <ProtectedRoute><Order /></ProtectedRoute>
      </Route>
      <Route path="/kds/:zone">
        <ProtectedRoute><Kds /></ProtectedRoute>
      </Route>
      <Route path="/cobro/:orderId">
        <ProtectedRoute><Payment /></ProtectedRoute>
      </Route>
      <Route path="/ticket/:orderId">
        <ProtectedRoute><Ticket /></ProtectedRoute>
      </Route>
      <Route path="/recogida">
        <ProtectedRoute><Recogida /></ProtectedRoute>
      </Route>
      <Route path="/prefactura/:orderId">
        <ProtectedRoute><Prefactura /></ProtectedRoute>
      </Route>
      <Route path="/online-orders">
        <ProtectedRoute><OnlineOrdersInbox /></ProtectedRoute>
      </Route>
      <Route path="/delivery">
        <ProtectedRoute><DeliveryPage /></ProtectedRoute>
      </Route>

      {/* ── Cash: encargado, manager, admin ──────────────────────────────── */}
      <Route path="/caja">
        <RequireRole roles={ROLES_CASH}><CashSession /></RequireRole>
      </Route>
      <Route path="/caja/informe/:sessionId">
        <RequireRole roles={ROLES_CASH}><ZReport /></RequireRole>
      </Route>
      <Route path="/caja/x-informe/:sessionId">
        <RequireRole roles={ROLES_CASH}><XReport /></RequireRole>
      </Route>

      {/* ── Reservations: any authenticated ──────────────────────────────── */}
      <Route path="/reservas">
        <ProtectedRoute><Reservations /></ProtectedRoute>
      </Route>

      {/* ── Manager+ admin area ───────────────────────────────────────────── */}
      <Route path="/admin">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminDashboard /></RequireRole>
      </Route>
      <Route path="/admin/crm">
        <RequirePermission permission="crm.manage"><Crm /></RequirePermission>
      </Route>
      <Route path="/admin/online-orders-config">
        <RequireRole roles={ROLES_MANAGER_UP}><OnlineConfig /></RequireRole>
      </Route>
      <Route path="/admin/online-reports">
        <RequireRole roles={ROLES_MANAGER_UP}><OnlineReports /></RequireRole>
      </Route>
      <Route path="/admin/branding">
        <RequireRole roles={ROLES_MANAGER_UP}><Branding /></RequireRole>
      </Route>
      <Route path="/admin/qr-menu">
        <RequireRole roles={ROLES_MANAGER_UP}><QrMenuPage /></RequireRole>
      </Route>
      <Route path="/admin/backup">
        <RequirePermission permission="backup.manage"><BackupPage /></RequirePermission>
      </Route>
      <Route path="/admin/diagnostics">
        <RequireRole roles={ROLES_MANAGER_UP}><DiagnosticsPage /></RequireRole>
      </Route>
      <Route path="/admin/devices">
        <RequireRole roles={ROLES_MANAGER_UP}><DevicesPage /></RequireRole>
      </Route>
      <Route path="/admin/hr">
        <RequirePermission permission="employees.manage"><HRPage /></RequirePermission>
      </Route>
      <Route path="/admin/director">
        <RequireRole roles={ROLES_MANAGER_UP}><DirectorPage /></RequireRole>
      </Route>
      {/* ── Fichaje — módulo unificado de control horario ──────────────────── */}
      <Route path="/admin/fichaje">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePanelDiario /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/registros">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeRegistros /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/empleados">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeEmpleados /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/turnos">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeTurnos /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/planificacion">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Planificación" description="Gestión de turnos semanales, plantillas y publicación de planificación." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/pausas">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Pausas" description="Registro y control de descansos activos e histórico de pausas por empleado." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/incidencias">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Incidencias" description="Alertas de fichajes anómalos: sin entrada, doble fichaje, salida sin entrada." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/correcciones">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Correcciones" description="Solicitudes y aprobaciones de corrección de registros con historial completo." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/vacaciones">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Vacaciones" description="Solicitudes de vacaciones, aprobaciones y calendario anual por empleado." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/ausencias">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeAusencias /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/importar">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeImportar /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/informes">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeInformes /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/costes">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Costes laborales" description="Coste por empleado, departamento y período con exportación a PDF/XLSX." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/portal">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Portal del empleado" description="Acceso personal del empleado a sus registros, horarios y solicitudes." /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/configuracion">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajeConfiguracion /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/fichaje/auditoria">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePlaceholder title="Auditoría" description="Trazabilidad completa de todos los cambios en registros de fichaje y configuración." /></FichajeLayout>
        </RequireRole>
      </Route>
      {/* Legacy redirect: /admin/fichaje/panel → /admin/fichaje */}
      <Route path="/admin/fichaje/panel">
        <RequireRole roles={ROLES_MANAGER_UP}>
          <FichajeLayout><FichajePanelDiario /></FichajeLayout>
        </RequireRole>
      </Route>
      <Route path="/admin/repartidores">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminRepartidores /></RequireRole>
      </Route>
      <Route path="/admin/reservas/turnos">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminTurnosReservas /></RequireRole>
      </Route>
      <Route path="/admin/impresoras">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminImpresoras /></RequireRole>
      </Route>
      <Route path="/admin/cola-impresion">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminColaImpresion /></RequireRole>
      </Route>
      <Route path="/admin/prueba-impresion">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminPrintTest /></RequireRole>
      </Route>
      <Route path="/admin/kds-stations">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminKdsStations /></RequireRole>
      </Route>
      <Route path="/admin/datos-demo">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminDatosDemo /></RequireRole>
      </Route>
      <Route path="/admin/salud">
        <RequireRole roles={ROLES_MANAGER_UP}><AdminSalud /></RequireRole>
      </Route>

      {/* ── Admin-only area ───────────────────────────────────────────────── */}
      <Route path="/configuracion">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Configuracion /></RequireRole>
      </Route>
      <Route path="/configuracion/salas/:zoneId">
        <RequireRole roles={ROLES_ADMIN_ONLY}><ZoneEditor /></RequireRole>
      </Route>
      <Route path="/configuracion/documentos">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Documentos /></RequireRole>
      </Route>
      <Route path="/fiscal">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Fiscal /></RequireRole>
      </Route>
      <Route path="/categorias">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Categorias /></RequireRole>
      </Route>
      <Route path="/productos">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Productos /></RequireRole>
      </Route>
      <Route path="/modificadores">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Modificadores /></RequireRole>
      </Route>
      <Route path="/ingredientes">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Ingredientes /></RequireRole>
      </Route>
      <Route path="/stock">
        <RequirePermission permission="stock.manage"><Stock /></RequirePermission>
      </Route>
      <Route path="/admin/caja-automatica">
        <RequireRole roles={ROLES_ADMIN_ONLY}><CajaAutomatica /></RequireRole>
      </Route>
      <Route path="/admin/caja-automatica/estado">
        <RequireRole roles={ROLES_ADMIN_ONLY}><CajaAutomaticaEstado /></RequireRole>
      </Route>
      <Route path="/admin/inventario/fisico">
        <RequireRole roles={ROLES_ADMIN_ONLY}><InventarioFisico /></RequireRole>
      </Route>
      <Route path="/admin/inventario/informes">
        <RequireRole roles={ROLES_ADMIN_ONLY}><InformesStock /></RequireRole>
      </Route>
      <Route path="/admin/subrecetas">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Subrecetas /></RequireRole>
      </Route>
      <Route path="/admin/rentabilidad">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Rentabilidad /></RequireRole>
      </Route>
      <Route path="/admin/simulador-precios">
        <RequireRole roles={ROLES_ADMIN_ONLY}><SimuladorPrecios /></RequireRole>
      </Route>
      <Route path="/admin/proveedores">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Proveedores /></RequireRole>
      </Route>
      <Route path="/admin/comparacion-precios">
        <RequireRole roles={ROLES_ADMIN_ONLY}><ComparacionPrecios /></RequireRole>
      </Route>
      <Route path="/admin/pedidos-compra">
        <RequireRole roles={ROLES_ADMIN_ONLY}><PedidosCompra /></RequireRole>
      </Route>
      <Route path="/admin/recepcion-mercancia">
        <RequireRole roles={ROLES_ADMIN_ONLY}><RecepcionMercancia /></RequireRole>
      </Route>
      <Route path="/admin/facturas-proveedor">
        <RequireRole roles={ROLES_ADMIN_ONLY}><FacturasProveedor /></RequireRole>
      </Route>
      <Route path="/admin/conciliacion">
        <RequireRole roles={ROLES_ADMIN_ONLY}><ConciliacionDocumental /></RequireRole>
      </Route>
      <Route path="/admin/lotes-caducidades">
        <RequireRole roles={ROLES_ADMIN_ONLY}><LotesCaducidades /></RequireRole>
      </Route>
      <Route path="/admin/escaner-facturas">
        <RequireRole roles={ROLES_ADMIN_ONLY}><EscanerFacturas /></RequireRole>
      </Route>
      <Route path="/admin/revision-factura/:id">
        <RequireRole roles={ROLES_ADMIN_ONLY}><RevisionFactura /></RequireRole>
      </Route>
      <Route path="/admin/conciliacion-factura/:id">
        <RequireRole roles={ROLES_ADMIN_ONLY}><ConciliacionFactura /></RequireRole>
      </Route>
      <Route path="/admin/trazabilidad-lotes">
        <RequireRole roles={ROLES_ADMIN_ONLY}><TrazabilidadLotes /></RequireRole>
      </Route>
      <Route path="/admin/retirada-lote">
        <RequireRole roles={ROLES_ADMIN_ONLY}><RetiradasLote /></RequireRole>
      </Route>
      <Route path="/admin/verifactu">
        <RequireRole roles={ROLES_ADMIN_ONLY}><Verifactu /></RequireRole>
      </Route>
      <Route path="/admin/mermas">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminMermas /></RequireRole>
      </Route>
      <Route path="/admin/categorias-ingredientes">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminCategoriasIngredientes /></RequireRole>
      </Route>
      <Route path="/admin/almacenes">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminAlmacenes /></RequireRole>
      </Route>
      <Route path="/admin/instalacion">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminInstalacion /></RequireRole>
      </Route>
      <Route path="/admin/instalacion/qr">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminInstalacionQR /></RequireRole>
      </Route>
      <Route path="/admin/permisos">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminPermisos /></RequireRole>
      </Route>
      <Route path="/admin/sistema">
        <RequireRole roles={ROLES_ADMIN_ONLY}><AdminSistema /></RequireRole>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <OfflineBanner />
          <Router />
        </WouterRouter>
        <Toaster theme="dark" position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
