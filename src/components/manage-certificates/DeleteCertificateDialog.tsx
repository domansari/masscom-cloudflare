import React from "react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Certificate {
  id: string;
  student_name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  certificate: Certificate | null;
  onConfirm: () => void;
  isDeleting: boolean;
  password: string;
  setPassword: (password: string) => void;
  passwordError: string;
  setPasswordError: (error: string) => void;
}

export const DeleteCertificateDialog: React.FC<Props> = ({
  isOpen, onClose, certificate, onConfirm, isDeleting
}) => (
  <Dialog open={isOpen} onOpenChange={open => {
    if (!open && !isDeleting) onClose();
  }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete Certificate</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete the certificate for{" "}
          {certificate?.student_name || "this student"}?
          This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={isDeleting || !certificate}
        >
          {isDeleting ? "Deleting..." : "Delete Certificate"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
