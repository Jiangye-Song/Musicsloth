import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";

interface TextInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
  title: string;
  label: string;
  submitLabel?: string;
  initialValue?: string;
  validateUnique?: (value: string) => Promise<boolean>; // Returns true if value is unique/valid
  duplicateErrorMessage?: string;
}

export default function TextInputDialog({
  open,
  onClose,
  onSubmit,
  title,
  label,
  submitLabel = "Save",
  initialValue = "",
  validateUnique,
  duplicateErrorMessage = "This name already exists",
}: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnique, setIsUnique] = useState(true);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
      setIsUnique(true);
    }
  }, [open, initialValue]);

  // Validate uniqueness when value changes
  useEffect(() => {
    if (!validateUnique || !open) return;
    
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      setIsUnique(true);
      return;
    }

    const checkUnique = async () => {
      const unique = await validateUnique(trimmed);
      setIsUnique(unique);
    };

    const timeoutId = setTimeout(checkUnique, 300);
    return () => clearTimeout(timeoutId);
  }, [value, validateUnique, initialValue, open]);

  const trimmedValue = value.trim();
  const isEmpty = trimmedValue === "";
  const isUnchanged = trimmedValue === initialValue;
  const canSubmit = !isEmpty && !loading && isUnique && !isUnchanged;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      await onSubmit(trimmedValue);
      onClose();
    } catch (err: any) {
      console.error("TextInputDialog submit error:", err);
      setError(err?.message || err?.toString() || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getHelperText = () => {
    if (error) return error;
    if (!isEmpty && !isUnique) return duplicateErrorMessage;
    return "";
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={label}
          type="text"
          fullWidth
          variant="outlined"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          error={!!error || (!isEmpty && !isUnique)}
          helperText={getHelperText()}
          disabled={loading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit}
        >
          {loading ? "Saving..." : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
