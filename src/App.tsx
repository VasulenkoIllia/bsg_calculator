/**
 * Top-level router.
 *
 * Route layout:
 *   /login          → LoginPage (public)
 *   /               → PrivateRoute gate
 *     /             → redirect to /companies (default landing)
 *     /companies    → CompaniesPage (Sprint 2.8.D)
 *     /companies/:id → CompanyDetailPage (Sprint 2.8.E)
 *     /calculator   → existing CalculatorPage (new-draft mode)
 *     /calculators  → CalculatorsListPage (top-level discovery — Sprint 6.6)
 *     /calc/:id     → CalculatorPage (edit-saved-config mode — Sprint 6.1)
 *     /wizard       → existing WizardPage
 *     *             → NotFoundPage
 *
 * Auth gate sits OUTSIDE CalculatorProvider so logged-out users
 * don't pay the cost of initialising calculator state they can't
 * use yet.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { PrivateRoute } from "./components/PrivateRoute.js";
import { CalculatorProvider } from "./contexts/CalculatorContext.js";
import { CalculatorPage } from "./pages/CalculatorPage.js";
import { CalculatorsListPage } from "./pages/CalculatorsListPage.js";
import { CompaniesPage } from "./pages/CompaniesPage.js";
import { CompanyDetailPage } from "./pages/CompanyDetailPage.js";
import { DocumentsListPage } from "./pages/DocumentsListPage.js";
import { DocumentViewPage } from "./pages/DocumentViewPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { WizardPage } from "./pages/WizardPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route. PrivateRoute also redirects here on 401. */}
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated subtree. CalculatorProvider sits inside
            the gate so its initialisation only runs for logged-in
            users (calculator state is per-session, never persisted). */}
        <Route element={<PrivateRoute />}>
          <Route
            element={
              <CalculatorProvider>
                <AppShell />
              </CalculatorProvider>
            }
          >
            <Route path="/" element={<Navigate to="/companies" replace />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/documents" element={<DocumentsListPage />} />
            <Route path="/documents/:number" element={<DocumentViewPage />} />
            <Route path="/calculator" element={<CalculatorPage />} />
            <Route path="/calculators" element={<CalculatorsListPage />} />
            <Route path="/calc/:id" element={<CalculatorPage />} />
            <Route path="/wizard" element={<WizardPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
