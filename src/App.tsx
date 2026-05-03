import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { CalculatorProvider } from "./contexts/CalculatorContext.js";
import { CalculatorPage } from "./pages/CalculatorPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { WizardPage } from "./pages/WizardPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <CalculatorProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/calculator" replace />} />
            <Route path="/calculator" element={<CalculatorPage />} />
            <Route path="/wizard" element={<WizardPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </CalculatorProvider>
    </BrowserRouter>
  );
}
