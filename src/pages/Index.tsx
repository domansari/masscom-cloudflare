import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Search, Plus, Settings, Shield, Cpu, Database } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CertificatePortalIntro from "@/components/CertificatePortalIntro";

const Index = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40"></div>
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="mb-12">
          <CertificatePortalIntro />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer bg-white/10 backdrop-blur-lg border-white/20 hover:bg-white/15">
                <Link to="/generate">
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mb-4 shadow-lg">
                      <Plus className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl text-white">Generate Certificate</CardTitle>
                    <CardDescription className="text-gray-300">
                      Create new certificates for students with digital signatures and QR codes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800" size="lg">
                      Start Creating
                    </Button>
                  </CardContent>
                </Link>
              </Card>

              <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer bg-white/10 backdrop-blur-lg border-white/20 hover:bg-white/15">
                <Link to="/manage">
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center mb-4 shadow-lg">
                      <Settings className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl text-white">Manage Certificates</CardTitle>
                    <CardDescription className="text-gray-300">
                      {isAdmin ? "View, edit, and delete certificates" : "View and edit certificates"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800" size="lg">
                      Manage Now
                    </Button>
                  </CardContent>
                </Link>
              </Card>

          <Card className="hover:shadow-xl transition-all duration-300 bg-white/10 backdrop-blur-lg border-white/20 hover:bg-white/15">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-full flex items-center justify-center mb-4 shadow-lg">
                <Database className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-xl text-white">Mark Sheets</CardTitle>
              <CardDescription className="text-gray-300">
                Enter DCA terminal marks, manage mark sheets, and create certificates for students who pass.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-gradient-to-r from-cyan-600 to-cyan-800 hover:from-cyan-700 hover:to-cyan-900" size="lg">
                <Link to="/marksheets">Create / Manage Mark Sheets</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer bg-white/10 backdrop-blur-lg border-white/20 hover:bg-white/15">
            <Link to="/verify">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-green-700 rounded-full flex items-center justify-center mb-4 shadow-lg">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl text-white">Verify Certificate</CardTitle>
                <CardDescription className="text-gray-300">
                  Instantly verify the authenticity of any certificate using QR codes or certificate IDs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800" size="lg">
                  Verify Now
                </Button>
              </CardContent>
            </Link>
          </Card>

        </div>

        <div className="text-center mt-16">
          <div className="bg-white/10 backdrop-blur-lg rounded-lg shadow-xl p-8 max-w-4xl mx-auto border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">Features</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="bg-gradient-to-br from-cyan-400 to-cyan-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-medium mb-2 text-white">Digital Certificates</h3>
                <p className="text-sm text-gray-300">Professional certificate templates with institutional branding</p>
              </div>
              <div className="text-center">
                <div className="bg-gradient-to-br from-orange-400 to-orange-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <Search className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-medium mb-2 text-white">QR Verification</h3>
                <p className="text-sm text-gray-300">Instant verification through QR codes and unique certificate IDs</p>
              </div>
              <div className="text-center">
                <div className="bg-gradient-to-br from-pink-400 to-pink-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-medium mb-2 text-white">Smart Management</h3>
                <p className="text-sm text-gray-300">Comprehensive tools for certificate lifecycle management</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
