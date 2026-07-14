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
import Ticket from './pages/ticket';
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
      <Route path="/ticket/:orderId" component={Ticket} />
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
