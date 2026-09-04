'use client';

import { useId, useState, useCallback, useRef } from 'react';
import { cn } from '../utils';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import type { FormFieldProps } from '../types';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export interface MultiFileUploadProps extends Omit<FormFieldProps, 'children'> {
  value?: File[];
  onChange?: (files: File[]) => void;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  showPreview?: boolean;
}

export function MultiFileUpload({
  className,
  label,
  error,
  helperText,
  required = false,
  disabled = false,
  value = [],
  onChange,
  accept = '.jpg,.jpeg,.png,.pdf',
  maxSize = MAX_FILE_SIZE,
  maxFiles = 10,
  id,
  'data-testid': testId,
}: MultiFileUploadProps) {
  const generatedId = useId();
  const uploadId = id || `multi-file-upload-${generatedId}`;
  const [isDragging, setIsDragging] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `${file.name}: only JPG, JPEG, PNG, and PDF are accepted`;
    }
    if (file.size > maxSize) {
      return `${file.name}: file size must be less than ${Math.round(maxSize / (1024 * 1024))}MB`;
    }
    return null;
  }, [maxSize]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const accepted: File[] = [];
    let firstError: string | null = null;
    for (const file of arr) {
      const err = validateFile(file);
      if (err) {
        if (!firstError) firstError = err;
        continue;
      }
      accepted.push(file);
    }
    const merged = [...value, ...accepted].slice(0, maxFiles);
    if (merged.length === maxFiles && value.length + accepted.length > maxFiles) {
      firstError = firstError || `You can upload at most ${maxFiles} files`;
    }
    setInternalError(firstError);
    onChange?.(merged);
  }, [value, validateFile, onChange, maxFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleRemove = useCallback((idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange?.(next);
    setInternalError(null);
  }, [value, onChange]);

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label htmlFor={uploadId} className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
          isDragging ? 'border-blue-500 bg-blue-50' : '',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500',
        )}
        style={{ borderColor: (error || internalError) ? 'var(--color-red-500)' : 'var(--border-primary)' }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        data-testid={testId}
      >
        <input
          ref={inputRef}
          id={uploadId}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileInput}
          disabled={disabled || value.length >= maxFiles}
          className="hidden"
        />
        <label htmlFor={uploadId} className="cursor-pointer block">
          <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-blue-600)' }} />
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {value.length >= maxFiles ? `Maximum ${maxFiles} files reached` : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            JPG, JPEG, PNG or PDF — up to {maxFiles} files (Max {Math.round(maxSize / (1024 * 1024))}MB each)
          </p>
          {value.length > 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
              {value.length} of {maxFiles} files selected
            </p>
          )}
        </label>
      </div>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="card p-3 border flex items-center justify-between"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-blue-600)' }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{Math.round(file.size / 1024)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                disabled={disabled}
                className="ml-3 p-1.5 rounded-full hover:bg-red-50 transition-colors disabled:opacity-50"
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-4 h-4" style={{ color: 'var(--color-red-600)' }} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(error || internalError) && (
        <p className="text-sm flex items-center gap-1" style={{ color: 'var(--color-red-600)' }}>
          <AlertCircle className="w-4 h-4" />
          {error || internalError}
        </p>
      )}

      {helperText && !error && !internalError && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{helperText}</p>
      )}
    </div>
  );
}
