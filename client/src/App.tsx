import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Characters from "./pages/Characters";
import History from "./pages/History";
import Purchases from "./pages/Purchases";
import SalesCycles from "./pages/SalesCycles";
import Images from "./pages/Images";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import RaidProtectedRoute from "./components/RaidProtectedRoute";
import RaidDashboard from "./pages/raid/RaidDashboard";
import RaidInventory from "./pages/raid/RaidInventory";
import RaidClans from "./pages/raid/RaidClans";
import RaidCycles from "./pages/raid/RaidCycles";
import RaidSettings from "./pages/raid/RaidSettings";
import RaidPurchases from "./pages/raid/RaidPurchases";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/inventory" component={() => <ProtectedRoute component={Inventory} />} />
      <Route path="/characters" component={() => <ProtectedRoute component={Characters} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/purchases" component={() => <ProtectedRoute component={Purchases} />} />
      <Route path="/cycles" component={() => <ProtectedRoute component={SalesCycles} />} />
      <Route path="/images" component={() => <ProtectedRoute component={Images} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} />} />
      <Route path="/raids" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidDashboard} required="view" />} />} />
      <Route path="/raids/inventory" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidInventory} required="view" />} />} />
      <Route path="/raids/clans" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidClans} required="view" />} />} />
      <Route path="/raids/cycles" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidCycles} required="view" />} />} />
      <Route path="/raids/purchases" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidPurchases} required="view" />} />} />
      <Route path="/raids/settings" component={() => <ProtectedRoute component={() => <RaidProtectedRoute component={RaidSettings} required="admin" />} />} />
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
            <Router />
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
