import ExcelBackup from "@/components/ExcelBackup";
import { Button } from "@/components/ui/button";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCertificateBatch } from "@/lib/batch-certificates";
import { Link, useSearchParams } from "react-router-dom";
import WorkspaceTabs from "@/components/WorkspaceTabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditCertificateForm from "@/components/EditCertificateForm";
import { CertificateFilters } from "@/components/manage-certificates/CertificateFilters";
import { CertificateTable } from "@/components/manage-certificates/CertificateTable";
import { DeleteCertificateDialog } from "@/components/manage-certificates/DeleteCertificateDialog";
import { CertificatePagination } from "@/components/manage-certificates/CertificatePagination";
import { useAuth } from "@/contexts/AuthContext";

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
  created_at: string;
}

type SortField = 'completion_date' | 'course_name' | 'student_name' | 'created_at' | 'batch_number';
type SortOrder = 'asc' | 'desc';

const RECORDS_PER_PAGE = 20;

const ManageCertificates = () => {
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const canDelete = isAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [certificateToDelete, setCertificateToDelete] = useState<Certificate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [batchDownloading, setBatchDownloading] = useState(false);

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => {
      const response = await fetch("/api/certificates", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Failed to load certificates");
      const result = await response.json();
      return result.data || [];
    }
  });

  useEffect(() => {
    const recordId = searchParams.get("studentRecord");
    if (!recordId || !certificates.length) return;
    const record = certificates.find((item: Certificate) => item.id === recordId);
    if (record) handleEditCertificate(record);
  }, [certificates, searchParams]);

  const batchCodes: string[] = Array.from(new Set<string>(certificates.map((c: Certificate) => c.batch_number?.trim() || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const batchCount = certificates.filter((c: Certificate) => c.batch_number?.trim() === selectedBatch).length;

  const downloadBatch = async () => {
    if (!selectedBatch || batchDownloading) return;
    setBatchDownloading(true);
    try {
      const records = certificates.filter((c: Certificate) => c.batch_number?.trim() === selectedBatch)
        .sort((a: Certificate, b: Certificate) => (a.roll_no || "").localeCompare(b.roll_no || "", undefined, { numeric: true }) || a.student_name.localeCompare(b.student_name));
      await downloadCertificateBatch(records, selectedBatch);
      toast({ title: "Batch PDF downloaded", description: records.length + " certificates, one per page." });
    } catch (error) {
      toast({ title: "Batch download failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBatchDownloading(false);
    }
  };

  const confirmDelete = async () => {
    if (!canDelete) return;
    if (!certificateToDelete) {
      toast({
        title: "Missing Information",
        description: "No certificate selected for deletion.",
        variant: "destructive",
      });
      return;
    }



    if (!deletePassword) {
      setDeletePasswordError("Enter your login password.");
      return;
    }
    setIsDeleting(true);
    setDeletePasswordError("");
    try {
      const response = await fetch(
        `/api/certificates/${encodeURIComponent(certificateToDelete.id)}`,
        { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: deletePassword }) }
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to delete certificate");
      }

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      
      setCertificateToDelete(null);
      setDialogOpen(false);
      setDeletePassword("");
      setDeletePasswordError("");
      
      toast({
        title: "Certificate Deleted",
        description: `Certificate for ${certificateToDelete.student_name} has been permanently deleted.`,
      });
      
    } catch (error: any) {
      setDeletePasswordError(error.message || "Failed to delete certificate.");
      toast({
        title: "Error",
        description: error.message || "Failed to delete certificate.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditCertificate = (certificate: Certificate) => {
    setEditingCertificate(certificate);
    setEditDialogOpen(true);
  };

  const handleUpdateCertificate = async (updatedData: any) => {
    if (!editingCertificate) return;

    try {
      const response = await fetch(
        `/api/certificates/${encodeURIComponent(editingCertificate.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedData)
        }
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to update certificate");
      }

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      setEditDialogOpen(false);
      setEditingCertificate(null);

      toast({
        title: "Certificate Updated",
        description: "Certificate has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update certificate.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCertificate = (certificate: Certificate) => {
    setCertificateToDelete(certificate);
    setDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDialogOpen(false);
    setCertificateToDelete(null);
    setDeletePassword("");
    setDeletePasswordError("");
  };

  // Filter and sort certificates
  const sortedAndFilteredCertificates = certificates
    .filter(cert =>
      cert.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.certificate_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.course_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cert.roll_no && cert.roll_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cert.batch_number && cert.batch_number.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      switch (sortField) {
        case 'completion_date':
          aValue = new Date(a.completion_date);
          bValue = new Date(b.completion_date);
          break;
        case 'course_name':
          aValue = a.course_name.toLowerCase();
          bValue = b.course_name.toLowerCase();
          break;
        case 'student_name':
          aValue = a.student_name.toLowerCase();
          bValue = b.student_name.toLowerCase();
          break;
        case 'batch_number':
          aValue = (a.batch_number || '').toLowerCase();
          bValue = (b.batch_number || '').toLowerCase();
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Pagination calculations
  const totalPages = Math.ceil(sortedAndFilteredCertificates.length / RECORDS_PER_PAGE);
  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
  const endIndex = startIndex + RECORDS_PER_PAGE;
  const paginatedCertificates = sortedAndFilteredCertificates.slice(startIndex, endIndex);

  // Reset to first page when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  if (isLoading) {
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
              <Link to="/" className="flex items-center space-x-3 text-white hover:text-gray-200 transition-colors">
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Home</span>
              </Link>
              <h1 className="text-xl font-semibold text-white">Manage Certificates</h1>
              <div className="w-24"></div>
            </div>
          </div>
        </nav>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader>
              <CardTitle className="text-white">Manage Certificates</CardTitle>
              <CardDescription className="text-gray-200">Loading certificates...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

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
            <Link to="/" className="flex items-center space-x-3 text-white hover:text-gray-200 transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>
            <h1 className="text-xl font-semibold text-white">Manage Certificates</h1>
            <div className="w-24"></div>
          </div>
        </div>
      </nav>

      <WorkspaceTabs label="Certificate sections" tabs={[{ label: "Create Certificate", to: "/generate", active: false }, { label: "Manage Certificate", to: "/manage", active: true }]} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader>
            <CardTitle className="text-white">Manage Certificates</CardTitle>
            <CardDescription className="text-gray-200">
              View, edit, and delete existing certificates ({sortedAndFilteredCertificates.length} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canDelete && <ExcelBackup type="certificates" />}
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md bg-white/90 p-3 text-gray-900">
              <span className="font-medium">Download Certificates by Batch</span>
              <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Select Batch Code" /></SelectTrigger>
                <SelectContent>{batchCodes.map(batch => <SelectItem key={batch} value={batch}>{batch}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={() => void downloadBatch()} disabled={!selectedBatch || batchDownloading}>
                <Download className="mr-2 h-4 w-4" />{batchDownloading ? "Preparing PDF..." : "Download Batch PDF" + (selectedBatch ? " (" + batchCount + ")" : "")}
              </Button>
            </div>
            <CertificateFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              sortField={sortField}
              setSortField={setSortField}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              totalRecords={sortedAndFilteredCertificates.length}
              startIndex={startIndex}
              endIndex={endIndex}
            />

            {sortedAndFilteredCertificates.length === 0 ? (
              <div className="text-center text-gray-200 py-8">
                {searchTerm ? "No certificates found matching your search." : "No certificates found."}
              </div>
            ) : (
              <>
                <CertificateTable
                  certificates={paginatedCertificates}
                  onEdit={handleEditCertificate}
                  onDelete={canDelete ? handleDeleteCertificate : undefined}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />

                <CertificatePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {canDelete && <DeleteCertificateDialog
        isOpen={dialogOpen}
        onClose={handleCloseDeleteDialog}
        certificate={certificateToDelete}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        password={deletePassword}
        setPassword={setDeletePassword}
        passwordError={deletePasswordError}
        setPasswordError={setDeletePasswordError}
      />}

      {/* Edit Certificate Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Certificate</DialogTitle>
            <DialogDescription>
              Update the certificate information below.
            </DialogDescription>
          </DialogHeader>
          {editingCertificate && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link to={`/marksheets/manage?certificate=${encodeURIComponent(editingCertificate.id)}`}>View Marksheet</Link></Button>
                <Button asChild variant="outline"><Link to={`/marksheets?certificate=${encodeURIComponent(editingCertificate.id)}&edit=1`}>Update Marksheet</Link></Button>
              </div>
              <EditCertificateForm
                certificate={editingCertificate}
                onUpdate={handleUpdateCertificate}
                onCancel={() => {
                  setEditDialogOpen(false);
                  setEditingCertificate(null);
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageCertificates;
