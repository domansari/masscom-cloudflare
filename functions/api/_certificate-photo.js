export function certificatePhotoUrl(qrData, role) {
  if (role !== "admin") return null;
  try {
    const studentId = JSON.parse(qrData)?.certificatePhotoStudentId;
    if (typeof studentId !== "string" || !studentId) return null;
    return "/api/students/files?" + new URLSearchParams({ student_id: studentId, type: "photo", preview: "1" });
  } catch {
    return null;
  }
}
