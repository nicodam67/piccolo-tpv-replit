import { Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import LocaleWrapper from "./components/providers/locale-wrapper.tsx";
import { SAVED_OR_DEFAULT_LOCALE, setLocaleInPath } from "./i18n";
import "./i18n";
import Index from "./pages/Index.tsx";
import AdminPage from "./pages/admin/page.tsx";
import AdminPortalPage from "./pages/admin-portal/page.tsx";
import CategoriaPage from "./pages/categoria/page.tsx";
import PrintPage from "./pages/print/page.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";

function RootRedirect() {
  return <Navigate to={setLocaleInPath(SAVED_OR_DEFAULT_LOCALE, "/")} replace />;
}

function AppRoutes() {
  useServiceWorker();

  return (
    <Routes>
      {/* Root: redirect to saved/default locale */}
      <Route path="/" element={<RootRedirect />} />

      {/* Non-localized admin portal */}
      <Route path="/admin" element={<AdminPortalPage />} />
      <Route path="/imprimir" element={<PrintPage />} />

      {/* All localized routes under /:lng */}
      <Route
        path="/:lng"
        element={
          <LocaleWrapper>
            <Outlet />
          </LocaleWrapper>
        }
      >
        <Route index element={<Index />} />
        <Route path="categoria/:categoryId" element={<CategoriaPage />} />
        <Route path="imprimir" element={<PrintPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// Strip trailing slash from BASE_URL for use as BrowserRouter basename
// e.g. "/qr-menu/" → "/qr-menu"
const basename = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "/";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter basename={basename}>
        <Suspense fallback={<div />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </DefaultProviders>
  );
}
