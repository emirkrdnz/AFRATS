// src/pages/transactions/ImportCsvDrawer.jsx
// Drawer for importing transactions from CSV.
// Shows: file picker, preview of first N rows, validation summary, import button.

import { useState, useRef } from 'react';
import { FiUploadCloud, FiFileText, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import Drawer from '../../components/Drawer';

export default function ImportCsvDrawer({
  open,
  onClose,
  onImport,    // async (file) => { imported, skipped, errors[] }
}) {
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setPreviewRows([]);
    setResult(null);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please select a .csv file.');
      return;
    }
    setFile(selectedFile);
    setResult(null);

    // Quick preview: read first 5 data rows and skip the header.
    const text = await selectedFile.text();
    const lines = text.split(/\r?\n/).slice(1, 6).filter(Boolean);
    const rows = lines.map((line) => line.split(',').map((c) => c.trim()));
    setPreviewRows(rows);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const r = await onImport(file);
      setResult(r);
    } catch (e) {
      setResult({ imported: 0, skipped: 0, errors: [e.message || 'Import failed'] });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Import Transactions"
      subtitle="Upload a CSV file to bulk-create transactions"
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || isImporting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* CSV format hint */}
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
          <div className="text-xs font-medium text-gray-700 mb-1">Expected CSV format</div>
          <code className="text-xs text-gray-600 block">
            TransactionDate,CategoryName,Description,Type,Amount
          </code>
          <div className="text-xs text-gray-500 mt-1">
            First row should be the header. Date format: yyyy-MM-dd
          </div>
        </div>

        {/* File picker — drag/drop area */}
        {!file && (
          <label
            htmlFor="csv-input"
            className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-secondary hover:bg-blue-50/30 transition-colors"
          >
            <FiUploadCloud className="w-8 h-8 text-gray-400" />
            <div className="text-sm text-gray-700 font-medium">Click to choose a CSV file</div>
            <div className="text-xs text-gray-500">or drag and drop here</div>
            <input
              id="csv-input"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />
          </label>
        )}

        {/* Selected file + preview */}
        {file && !result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FiFileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
                  <div className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <button
                onClick={reset}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Change
              </button>
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1.5">Preview (first 5 rows)</div>
                <div className="overflow-x-auto border border-gray-200 rounded-md">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date', 'Category', 'Description', 'Type', 'Amount'].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-600">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5 text-gray-700">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <FiCheckCircle className="w-5 h-5 text-income" />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {result.imported} transaction{result.imported !== 1 ? 's' : ''} imported
                </div>
                {result.skipped > 0 && (
                  <div className="text-xs text-gray-600">{result.skipped} skipped</div>
                )}
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2 mb-1">
                  <FiAlertCircle className="w-4 h-4 text-expense" />
                  <div className="text-sm font-medium text-gray-900">
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <ul className="text-xs text-gray-700 space-y-0.5 ml-6 list-disc">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      {typeof err === 'string'
                        ? err
                        : err?.message
                          ? (err.row ? `Row ${err.row}: ` : '') + err.message
                          : JSON.stringify(err)}
                    </li>
                  ))}
                  {result.errors.length > 5 && (
                    <li className="text-gray-500">…and {result.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
