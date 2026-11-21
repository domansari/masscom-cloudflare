
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
            <nav aria-label="Main website" className="no-print bg-black/60 text-white">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <a
                  href="https://www.masscom.co.in/"
                  className="inline-flex min-h-11 items-center gap-2 py-2 text-sm font-semibold hover:underline focus-visible:outline focus-visible:outline-2"
                >
                  Go to Home <span className="font-normal">www.masscom.co.in</span>
                </a>
              </div>
            </nav>
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
