import React, { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const returnValue = dialog.returnValue;
      dialog.returnValue = '';
      if (returnValue === 'confirm') {
        onConfirm();
      } else {
        onCancel();
      }
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onConfirm, onCancel]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="native-modal-dialog"
    >
      <div className="modal-dialog-inner">
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <p id={descId} className="modal-description">
          {description}
        </p>
        <form method="dialog" className="modal-actions">
          <button
            type="submit"
            value="cancel"
            className="btn btn-secondary"
            autoFocus={variant === 'danger' || variant === 'warning'}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            value="confirm"
            className={`btn ${
              variant === 'danger'
                ? 'btn-danger'
                : variant === 'warning'
                ? 'btn-warning'
                : 'btn-primary'
            }`}
            autoFocus={variant === 'primary'}
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </dialog>
  );
};
