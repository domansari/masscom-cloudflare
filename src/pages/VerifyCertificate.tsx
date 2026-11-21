
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Loader2, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PrintableMarksheet } from "@/lib/marksheet-pdf";
import MarksheetCanvasPreview from "@/components/MarksheetCanvasPreview";
import { Link, useSearchParams } from "react-router-dom";

import { useToast } from "@/hooks/use-toast";
import CertificatePreview from "@/components/CertificatePreview";
import { CertificateData } from "@/types/certificate";

interface Certificate {
  id: string;
  certificate_id: string;
  student_name: string;
  father_name: string;
  course_name: string;
  duration: string;
  completion_date: string;
  grade: string;
  student_coordinator: string;
  roll_no?: string;
  batch_number?: string;
  qr_code_data: string;
}

const VerifyCertificate = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [certificateId, setCertificateId] = useState("");
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [marksheet, setMarksheet] = useState<PrintableMarksheet | null>(null);
  const [preview, setPreview] = useState<"certificate" | "marksheet" | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const closePreview = () => {
    setPreview(null);
  };

  const openMarksheet = () => {
    if (marksheet) setPreview("marksheet");
  };

  // Auto-extract certificate ID from URL parameters and verify
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl.trim()) {
      setCertificateId(idFromUrl.trim());
      // Auto-verify if we have an ID from URL
      handleVerifyWithId(idFromUrl.trim());
    }
  }, [searchParams]);

  const handleVerifyWithId = async (id: string) => {
    if (!id.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter a certificate ID.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setCertificate(null);
    setMarksheet(null);
    closePreview();
    
    try {
      const response = await fetch(
        `/api/verify?id=${encodeURIComponent(id.trim())}`
      );
      const result = await response.json();
      const data = response.ok ? result.certificate : null;
      const error = response.ok
        ? null
        : {
            code: response.status === 404 ? 'PGRST116' : 'API_ERROR',
            message: result.error || 'Failed to verify certificate.'
          };

      if (error) {
        if (error.code === 'PGRST116') {
          setCertificate(null);
          setMarksheet(null);
          toast({
            title: "Certificate Not Found",
            description: "No certificate found with the provided ID.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        setCertificate(data);
        setMarksheet(result.marksheet || null);
        toast({
          title: "Certificate Found",
          description: "Certificate has been successfully verified.",
        });
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      setCertificate(null);
      toast({
        title: "Error",
        description: error.message || "Failed to verify certificate.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    await handleVerifyWithId(certificateId);
  };

  // Convert database Certificate to CertificateData format
  const convertToCertificateData = (cert: Certificate): CertificateData => {
    return {
      studentName: cert.student_name,
      fatherName: cert.father_name || '',
      courseName: cert.course_name,
      duration: cert.duration || '',
      completionDate: cert.completion_date,
      grade: cert.grade || '',
      studentCoordinator: cert.student_coordinator || '',
      certificateId: cert.certificate_id,
      rollNo: cert.roll_no,
    };
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage: `url('/lovable-uploads/1c1f036d-97eb-4825-9766-e1ddb31b3f55.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="absolute inset-0 bg-black/40"></div>
      <nav className="relative z-10 bg-white/10 backdrop-blur-lg shadow-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-3 text-white hover:text-gray-200 transition-colors duration-200">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>
            <h1 className="text-xl font-semibold text-white">Verify Certificate</h1>
            <div className="w-24"></div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-white/10 backdrop-blur-lg border-white/20 mb-8">
          <CardHeader>
            <CardTitle className="text-white">Verify Certificate</CardTitle>
            <CardDescription className="text-gray-200">
              Enter a certificate ID to verify its authenticity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="certificate-id" className="text-white">Certificate ID</Label>
                <Input
                  id="certificate-id"
                  type="text"
                  placeholder="Enter certificate ID (e.g., CERT-2024-001)"
                  value={certificateId}
                  onChange={(e) => setCertificateId(e.target.value)}
                  className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                  onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
                />
              </div>
              <Button 
                onClick={handleVerify} 
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Verify Certificate
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasSearched && (
          <>
            {certificate ? (
              <div className="space-y-6">
                <Card className="bg-green-50/90 backdrop-blur-lg border-green-200">
                  <CardHeader>
                    <CardTitle className="text-green-800 flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                      Certificate Verified ✓
                    </CardTitle>
                    <CardDescription className="text-green-700">
                      This certificate is authentic and was issued by our institution.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-green-800">Student Name:</span>
                        <p className="text-green-700">{certificate.student_name}</p>
                      </div>
                      <div>
                        <span className="font-medium text-green-800">Course:</span>
                        <p className="text-green-700">{certificate.course_name}</p>
                      </div>
                      <div>
                        <span className="font-medium text-green-800">Completion Date:</span>
                        <p className="text-green-700">
                          {new Date(certificate.completion_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-green-800">Grade:</span>
                        <p className="text-green-700">{certificate.grade}</p>
                      </div>
                      {certificate.roll_no && (
                        <div>
                          <span className="font-medium text-green-800">Roll Number:</span>
                          <p className="text-green-700">{certificate.roll_no}</p>
                        </div>
                      )}
                      {certificate.batch_number && (
                        <div>
                          <span className="font-medium text-green-800">Batch:</span>
                          <p className="text-green-700">{certificate.batch_number}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/90 backdrop-blur-lg border-gray-200">
                  <CardContent className="flex flex-col sm:flex-row gap-3 pt-6">
                    <Button className="flex-1" onClick={() => setPreview("certificate")}>
                      <FileText className="mr-2 h-4 w-4" /> Preview Certificate
                    </Button>
                    <Button className="flex-1" variant="outline" disabled={!marksheet || previewBusy} onClick={openMarksheet}>
                      {previewBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      Preview Marksheet
                    </Button>
                    {!marksheet && <p className="text-sm text-gray-600 self-center">No marksheet linked to this certificate.</p>}
                  </CardContent>
                </Card>
                <Dialog open={preview !== null} onOpenChange={open => { if (!open) closePreview(); }}>
                  <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>{preview === "certificate" ? "Certificate" : "Marksheet"} — Online Verification</DialogTitle>
                    </DialogHeader>
                    {preview === "certificate" ? (
                      <div className="flex-1 overflow-auto bg-gray-100 relative verification-certificate">
                        <div className="relative w-[210mm] h-[297mm] mx-auto">
                          <CertificatePreview data={convertToCertificateData(certificate)} />
                          <div aria-label="Online verification watermark" className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-hidden">
                            <span className="text-gray-500/35 text-6xl font-bold whitespace-nowrap -rotate-45 select-none">ONLINE VERIFICATION</span>
                          </div>
                        </div>
                      </div>
                    ) : marksheet ? (
                      <MarksheetCanvasPreview sheet={marksheet} />
                    ) : null}
                  </DialogContent>
                </Dialog>
                <style>{`
                  .verification-certificate #certificate-container { transform: none !important; }
                  .verification-certificate .no-print { display: none !important; }
                `}</style>
              </div>
            ) : (
              <Card className="bg-red-50/90 backdrop-blur-lg border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-800 flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                    Certificate Not Found ✗
                  </CardTitle>
                  <CardDescription className="text-red-700">
                    No certificate found with ID: <strong>{certificateId}</strong>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-red-700 text-sm">
                    Please check the certificate ID and try again. If you believe this is an error, 
                    contact our support team.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyCertificate;
