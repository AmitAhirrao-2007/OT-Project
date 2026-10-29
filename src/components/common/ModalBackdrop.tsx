import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
  footer,
  headerAction
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Handle ESC or backdrop click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      onClick={(e) => {
        // Light dismiss if clicking directly on the backdrop
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/75 backdrop:backdrop-blur-sm border-none overflow-visible max-h-[90vh] focus:outline-none"
    >
      <div
        className={`w-full ${maxWidth} bg-[#141414] border border-[#282828] text-[#EEEEEE] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626] bg-[#181818]">
          <div>
            <h2 id="modal-title" className="text-base font-bold text-[#EEEEEE]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[#A8A8A8] mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-[#A8A8A8] hover:text-[#EEEEEE] hover:bg-[#282828] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4 custom-scrollbar text-sm">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-[#262626] bg-[#161616] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
};

