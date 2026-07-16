import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';

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
import FichajeReloj from './pages/fichaje/FichajeReloj';
import FichajePanelDiario from './pages/fichaje/FichajePanelDiario';
import FichajeRegistros from './pages/fichaje/FichajeRegistros';
import FichajeTurnos from './pages/fichaje/FichajeTurnos';
import FichajeAusencias from './pages/fichaje/FichajeAusencias';
import FichajeImportarAnviz from './pages/fichaje/FichajeImportarAnviz';
import FichajeInformes from './pages/fichaje/FichajeInformes';
import FichajeConfiguracion from './pages/fichaje/FichajeConfiguracion';
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
import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/tables" component={Tables} />
      <Route path="/pedido/:tableId/:orderId" component={Order} />
      <Route path="/kds/:zone" component={Kds} />
      <Route path="/cobro/:orderId" component={Payment} />
      <Route path="/caja" component={CashSession} />
      <Route path="/caja/informe/:sessionId" component={ZReport} />
      <Route path="/caja/x-informe/:sessionId" component={XReport} />
      <Route path="/ticket/:orderId" component={Ticket} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/configuracion" component={Configuracion} />
      <Route path="/configuracion/salas/:zoneId" component={ZoneEditor} />
      <Route path="/configuracion/documentos" component={Documentos} />
      <Route path="/fiscal" component={Fiscal} />
      <Route path="/categorias" component={Categorias} />
      <Route path="/productos" component={Productos} />
      <Route path="/modificadores" component={Modificadores} />
      <Route path="/ingredientes" component={Ingredientes} />
      <Route path="/stock" component={Stock} />
      <Route path="/carta" component={Carta} />
      <Route path="/recogida" component={Recogida} />
      <Route path="/prefactura/:orderId" component={Prefactura} />
      <Route path="/reservas" component={Reservations} />
      <Route path="/admin/caja-automatica" component={CajaAutomatica} />
      <Route path="/admin/caja-automatica/estado" component={CajaAutomaticaEstado} />
      <Route path="/admin/inventario/fisico" component={InventarioFisico} />
      <Route path="/admin/inventario/informes" component={InformesStock} />
      <Route path="/admin/subrecetas" component={Subrecetas} />
      <Route path="/admin/rentabilidad" component={Rentabilidad} />
      <Route path="/admin/branding" component={Branding} />
      <Route path="/admin/simulador-precios" component={SimuladorPrecios} />
      <Route path="/admin/proveedores" component={Proveedores} />
      <Route path="/admin/comparacion-precios" component={ComparacionPrecios} />
      <Route path="/admin/pedidos-compra" component={PedidosCompra} />
      <Route path="/admin/recepcion-mercancia" component={RecepcionMercancia} />
      <Route path="/admin/facturas-proveedor" component={FacturasProveedor} />
      <Route path="/admin/conciliacion" component={ConciliacionDocumental} />
      <Route path="/admin/lotes-caducidades" component={LotesCaducidades} />
      <Route path="/admin/escaner-facturas" component={EscanerFacturas} />
      <Route path="/admin/revision-factura/:id" component={RevisionFactura} />
      <Route path="/admin/conciliacion-factura/:id" component={ConciliacionFactura} />
      <Route path="/admin/trazabilidad-lotes" component={TrazabilidadLotes} />
      <Route path="/admin/retirada-lote" component={RetiradasLote} />
      {/* Fichaje module — public mobile clock */}
      <Route path="/fichaje" component={FichajeReloj} />
      {/* Fichaje module — admin/manager pages */}
      <Route path="/admin/fichaje/panel" component={FichajePanelDiario} />
      <Route path="/admin/fichaje/registros" component={FichajeRegistros} />
      <Route path="/admin/fichaje/turnos" component={FichajeTurnos} />
      <Route path="/admin/fichaje/ausencias" component={FichajeAusencias} />
      <Route path="/admin/fichaje/importar" component={FichajeImportarAnviz} />
      <Route path="/admin/fichaje/informes" component={FichajeInformes} />
      <Route path="/admin/fichaje/configuracion" component={FichajeConfiguracion} />
      <Route path="/admin/verifactu" component={Verifactu} />
      <Route path="/admin/crm" component={Crm} />
      {/* Online Orders module */}
      <Route path="/online-orders" component={OnlineOrdersInbox} />
      <Route path="/admin/online-orders-config" component={OnlineConfig} />
      <Route path="/admin/online-reports" component={OnlineReports} />
      <Route path="/order-status/:orderNumber" component={OrderStatus} />
      <Route path="/driver/:courierId" component={DriverView} />
      {/* Printing module */}
      <Route path="/admin/impresoras" component={AdminImpresoras} />
      <Route path="/admin/cola-impresion" component={AdminColaImpresion} />
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
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster theme="dark" position="top-center" />
    </QueryClientProvider>
  );
}

export default App;
