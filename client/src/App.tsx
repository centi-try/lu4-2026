import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import L2Splash from "./components/L2Splash";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RaidProtectedRoute from "./components/RaidProtectedRoute";

// Login se carga de inmediato (es la pantalla de entrada para no logueados);
// el resto de páginas se cargan bajo demanda (code-splitting) para que la
// primera carga sea mucho más liviana.
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Characters = lazy(() => import("./pages/Characters"));
const History = lazy(() => import("./pages/History"));
const Purchases = lazy(() => import("./pages/Purchases"));
const SalesCycles = lazy(() => import("./pages/SalesCycles"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Backups = lazy(() => import("./pages/Backups"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const RaidDashboard = lazy(() => import("./pages/raid/RaidDashboard"));
const RaidInventory = lazy(() => import("./pages/raid/RaidInventory"));
const RaidClans = lazy(() => import("./pages/raid/RaidClans"));
const RaidCycles = lazy(() => import("./pages/raid/RaidCycles"));
const RaidSettings = lazy(() => import("./pages/raid/RaidSettings"));
const RaidPurchases = lazy(() => import("./pages/raid/RaidPurchases"));
const RaidHistory = lazy(() => import("./pages/raid/RaidHistory"));
const WarehouseClan = lazy(() => import("./pages/WarehouseClan"));
const ClansAndCps = lazy(() => import("./pages/ClansAndCps"));
const CpSplit = lazy(() => import("./pages/CpSplit"));

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/verify-email/:token" component={VerifyEmail} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/inventory" component={() => <ProtectedRoute component={Inventory} />} />
      <Route path="/characters" component={() => <ProtectedRoute component={Characters} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/purchases" component={() => <ProtectedRoute component={Purchases} />} />
      <Route path="/cycles" component={() => <ProtectedRoute component={SalesCycles} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/warehouse" component={() => <ProtectedRoute component={WarehouseClan} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} allowedRoles={["super_admin"]} />} />
      <Route path="/clans" component={() => <ProtectedRoute component={ClansAndCps} />} />
      <Route path="/cp-split" component={() => <ProtectedRoute component={CpSplit} allowedRoles={["super_admin"]} allowCpAccess />} />
      <Route path="/admin/backups" component={() => <ProtectedRoute component={Backups} allowedRoles={["super_admin"]} />} />
      <Route path="/raids" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidDashboard} required="view" />} />} />
      <Route path="/raids/inventory" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidInventory} required="interact" />} />} />
      <Route path="/raids/clans" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidClans} required="view" />} />} />
      <Route path="/raids/cycles" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidCycles} required="view" />} />} />
      <Route path="/raids/purchases" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidPurchases} required="view" />} />} />
      <Route path="/raids/history" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidHistory} required="view" />} />} />
      <Route path="/raids/settings" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidSettings} required="super_admin" />} />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AppProvider>
          <TooltipProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: 'rgba(10,14,22,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                },
              }}
            />
            <Suspense fallback={<L2Splash />}>
              <Router />
            </Suspense>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
