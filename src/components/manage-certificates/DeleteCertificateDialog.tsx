import React from "react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Certificate {
  id: string;
  student_name: string;
}

interface Props {
  recordType?: "Certificate" | "Marksheet";
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
  recordType = "Certificate", isOpen, onClose, certificate, onConfirm, isDeleting,
  password, setPassword, passwordError, setPasswordError
}) => (
  <Dialog open={isOpen} onOpenChange={open => {
    if (!open && !isDeleting) onClose();
  }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete {recordType}</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete the {recordType.toLowerCase()} for{" "}
          {certificate?.student_name || "this student"}?
          This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={event => { event.preventDefault(); if (password && !isDeleting) onConfirm(); }}>
        <div className="space-y-2 mb-4">
          <Label htmlFor="delete-certificate-password">Confirm your login password</Label>
          <Input id="delete-certificate-password" type="password" autoComplete="current-password"
            value={password} onChange={event => { setPassword(event.target.value); setPasswordError(""); }}
            placeholder="Enter your login password" disabled={isDeleting} required maxLength={1024} />
          {passwordError && <p className="text-sm text-destructive" role="alert">{passwordError}</p>}
        </div>
        <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          type="submit"
          disabled={isDeleting || !certificate || !password}
        >
          {isDeleting ? "Deleting..." : `Delete ${recordType}`}
        </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
