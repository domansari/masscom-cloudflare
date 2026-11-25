
export interface CertificateData {
  studentName: string;
  fatherName: string;
  courseName: string;
  duration: string;
  completionDate: string;
  grade: string;
  studentCoordinator: string;
  certificateId: string;
  photoUrl?: string | null;
  rollNo?: string;
}

export interface CertificatePreviewProps {
  data: CertificateData;
}
