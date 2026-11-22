
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import GenerateCertificate from "./pages/GenerateCertificate";
import ManageCertificates from "./pages/ManageCertificates";
import PrintCertificate from "./pages/PrintCertificate";
import VerifyCertificate from "./pages/VerifyCertificate";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import MarkSheets from "./pages/MarkSheets";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <div className="min-h-screen">
            <Header />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/verify" element={<VerifyCertificate />} />
              <Route path="/marksheets" element={<ProtectedRoute><MarkSheets /></ProtectedRoute>} />
              <Route path="/marksheets/manage" element={<ProtectedRoute><MarkSheets manage /></ProtectedRoute>} />
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/generate" 
                element={
                  <ProtectedRoute>
                    <GenerateCertificate />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/manage" 
                element={
                  <ProtectedRoute>
                    <ManageCertificates />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/print/:id" 
                element={
                  <ProtectedRoute>
                    <PrintCertificate />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
