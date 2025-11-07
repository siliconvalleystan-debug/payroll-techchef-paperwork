import React, { useCallback, useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import html2pdf from "html2pdf.js";
import toast from "react-hot-toast";
import { FIELD_DEFINITIONS, REQUIRED_FIELDS } from "./constants.js";
import {
  buildErrorSet,
  createEmptyEmployee,
  enrichEmployeeData,
  makeErrorKey,
  normaliseInputValue,
  sanitiseFilename,
} from "./utils.js";
import AssetUpload from "./components/AssetUpload.jsx";
import EmployeeRow from "./components/EmployeeRow.jsx";
import Payslip from "./components/Payslip.jsx";
import Modal from "./components/Modal.jsx";
import TechchefInvoiceTab from "./components/TechchefInvoiceTab.jsx";

const TAB_OPTIONS = [
  { id: "payroll", label: "Salary Pay Slip Generator" },
  { id: "techchef", label: "Techchef Invoice" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("payroll");
  const [employees, setEmployees] = useState(() => [createEmptyEmployee()]);
  const [errors, setErrors] = useState(new Set());
  const [previewData, setPreviewData] = useState(null);
  const [assets, setAssets] = useState({ logo: null, signature: null });
  const [generatingRow, setGeneratingRow] = useState(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(null); // 'single' or 'bulk'
  const [pendingRowIndex, setPendingRowIndex] = useState(null);

  const updateErrors = useCallback((nextErrors) => {
    setErrors(new Set(nextErrors));
  }, []);

  const clearErrorForField = useCallback(
    (rowIndex, fieldKey) => {
      const key = makeErrorKey(rowIndex, fieldKey);
      if (!errors.has(key)) {
        return;
      }
      const next = new Set(errors);
      next.delete(key);
      updateErrors(next);
    },
    [errors, updateErrors]
  );

  const validateEmployee = useCallback(
    (rowIndex, employee) => {
      let valid = true;
      const nextErrors = new Set(errors);

      REQUIRED_FIELDS.forEach((fieldKey) => {
        const key = makeErrorKey(rowIndex, fieldKey);
        if (!employee[fieldKey]?.trim()) {
          nextErrors.add(key);
          valid = false;
        } else {
          nextErrors.delete(key);
        }
      });

      updateErrors(nextErrors);
      return valid;
    },
    [errors, updateErrors]
  );

  const handleFieldChange = useCallback(
    (rowIndex, field, rawValue) => {
      setEmployees((prev) => {
        const next = prev.slice();
        next[rowIndex] = {
          ...next[rowIndex],
          [field.key]: normaliseInputValue(field, rawValue),
        };
        return next;
      });
      if (rawValue.trim()) {
        clearErrorForField(rowIndex, field.key);
      }
    },
    [clearErrorForField]
  );

  const handleAddRow = useCallback(() => {
    setEmployees((prev) => prev.concat(createEmptyEmployee()));
    toast.success("Employee row added");
  }, []);

  const handleRemoveRowAt = useCallback(
    (rowIndex) => {
      setEmployees((prev) => {
        if (prev.length === 1) {
          toast.error("At least one employee row is required");
          return prev;
        }
        const next = prev.filter((_, index) => index !== rowIndex);
        updateErrors(buildErrorSet(next));
        toast.success("Employee row removed");
        return next;
      });
    },
    [updateErrors]
  );

  const handleAssetChange = useCallback((key, file) => {
    if (!file) {
      setAssets((prev) => ({ ...prev, [key]: null }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, SVG, etc.).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAssets((prev) => ({ ...prev, [key]: reader.result }));
      toast.success(`${key === "logo" ? "Company logo" : "Signature"} uploaded successfully`);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAssetClear = useCallback((key) => {
    setAssets((prev) => ({ ...prev, [key]: null }));
  }, []);

  const handlePaste = useCallback(
    (event, startRowIndex, startColIndex) => {
      const clipboard = event.clipboardData?.getData("text/plain");
      if (!clipboard) {
        return;
      }

      const hasStructure = clipboard.includes("\n") || clipboard.includes("\t");
      if (!hasStructure) {
        return;
      }

      event.preventDefault();
      const lines = clipboard
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((line) => line.trim().length > 0);

      let updatedEmployees = null;
      setEmployees((prev) => {
        let next = prev.slice();
        let currentRowIndex = startRowIndex;

        lines.forEach((line) => {
          const values = line.split("\t");
          while (next.length <= currentRowIndex) {
            next = next.concat(createEmptyEmployee());
          }

          const rowDraft = { ...next[currentRowIndex] };
          let currentColIndex = startColIndex;

          values.forEach((value) => {
            if (currentColIndex >= FIELD_DEFINITIONS.length) {
              return;
            }
            const field = FIELD_DEFINITIONS[currentColIndex];
            rowDraft[field.key] = normaliseInputValue(field, value);
            currentColIndex += 1;
          });

          next[currentRowIndex] = rowDraft;
          currentRowIndex += 1;
        });

        updatedEmployees = next;
        return next;
      });
      if (updatedEmployees) {
        updateErrors(buildErrorSet(updatedEmployees));
      }
    },
    [updateErrors]
  );

  const handleGenerateForRow = useCallback(
    async (rowIndex, skipModal = false) => {
      const employee = employees[rowIndex];
      if (!employee) {
        return;
      }

      const isValid = validateEmployee(rowIndex, employee);
      if (!isValid) {
        toast.error("Please complete all required fields before generating the pay slip.");
        return;
      }

      if (!skipModal) {
        setPendingRowIndex(rowIndex);
        setModalType("single");
        setShowModal(true);
        return;
      }

      const enriched = enrichEmployeeData(employee);
      setPreviewData(enriched);

      setGeneratingRow(rowIndex);
      const loadingToast = toast.loading("Generating PDF...");

      const wrapper = document.createElement("div");
      wrapper.innerHTML = renderToStaticMarkup(<Payslip data={enriched} assets={assets} />);
      const node = wrapper.firstElementChild;
      document.body.appendChild(node);

      const filename = `${sanitiseFilename(enriched.employeeName)}-pay-slip.pdf`;
      const options = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
      };

      try {
        await html2pdf().set(options).from(node).save();
        toast.dismiss(loadingToast);
        toast.success(`PDF generated successfully: ${filename}`);
      } catch (error) {
        console.error("Failed to export PDF", error);
        toast.dismiss(loadingToast);
        toast.error("Unable to generate the PDF. Please try again.");
      } finally {
        node.remove();
        setGeneratingRow(null);
      }
    },
    [assets, employees, validateEmployee]
  );

  const handleGenerateAll = useCallback(async (skipModal = false) => {
    if (!employees.length) {
      toast.error("Add at least one employee before generating PDFs.");
      return;
    }

    // Validate all employees
    const invalidRows = [];
    employees.forEach((employee, index) => {
      const isValid = validateEmployee(index, employee);
      if (!isValid) {
        invalidRows.push(index + 1);
      }
    });

    if (invalidRows.length > 0) {
      toast.error(`Please complete all required fields for row(s): ${invalidRows.join(", ")}`);
      return;
    }

    if (!skipModal) {
      setModalType("bulk");
      setShowModal(true);
      return;
    }

    setBulkGenerating(true);
    const loadingToast = toast.loading(`Generating PDFs for ${employees.length} employee(s)...`);

    let successCount = 0;
    let failCount = 0;

    for (let index = 0; index < employees.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await handleGenerateForRow(index, true);
      successCount++;
    }

    toast.dismiss(loadingToast);
    if (failCount === 0) {
      toast.success(`Successfully generated ${successCount} PDF file(s)!`);
    } else {
      toast.error(`Generated ${successCount} PDF(s), ${failCount} failed.`);
    }

    setBulkGenerating(false);
  }, [employees, handleGenerateForRow, validateEmployee]);

  const handlePreview = useCallback(
    (rowIndex) => {
      const employee = employees[rowIndex];
      if (!employee) {
        return;
      }

      const isValid = validateEmployee(rowIndex, employee);
      if (!isValid) {
        toast.error("Please complete all required fields before previewing the pay slip.");
        return;
      }

      const enriched = enrichEmployeeData(employee);
      setPreviewData(enriched);
      toast.success("Preview updated");
    },
    [employees, validateEmployee]
  );

  const handleConfirmGenerate = useCallback(() => {
    setShowModal(false);
    if (modalType === "single" && pendingRowIndex !== null) {
      handleGenerateForRow(pendingRowIndex, true);
      setPendingRowIndex(null);
    } else if (modalType === "bulk") {
      handleGenerateAll(true);
    }
    setModalType(null);
  }, [modalType, pendingRowIndex, handleGenerateForRow, handleGenerateAll]);

  const disableRemove = employees.length === 1 || bulkGenerating || generatingRow !== null;

  const previewContent = useMemo(() => {
    if (!previewData) {
      return (
        <div className="preview-placeholder">
          <div>Generate a pay slip to see the preview</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>Click "Generate PDF" to preview the pay slip</div>
        </div>
      );
    }
    return <Payslip data={previewData} assets={assets} />;
  }, [assets, previewData]);

  useEffect(() => {
    if (activeTab !== "payroll" && showModal) {
      setShowModal(false);
      setModalType(null);
      setPendingRowIndex(null);
    }
  }, [activeTab, showModal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const validTab = TAB_OPTIONS.find((tab) => tab.id === tabParam);
    if (validTab) {
      setActiveTab(validTab.id);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (activeTab === "payroll") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", activeTab);
    }
    window.history.replaceState(null, "", url);
  }, [activeTab]);

  const payrollLayout = (
    <>
      <main className="layout">
        <section className="panel">
        <h1>Salary Pay Slip Generator</h1>
        <p className="description">
          Enter employee payroll details row-by-row and export polished pay slip PDFs that mirror the
          provided template.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn secondary"
            onClick={handleAddRow}
            disabled={bulkGenerating || generatingRow !== null}
          >
            Add Employee
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleGenerateAll}
            disabled={bulkGenerating || generatingRow !== null}
          >
            Generate PDFs for All
          </button>
        </div>

        <div className="asset-controls">
          <AssetUpload
            id="logo-upload"
            label="Company Logo"
            value={assets.logo}
            disabled={bulkGenerating || generatingRow !== null}
            onChange={(file) => handleAssetChange("logo", file)}
            onClear={() => handleAssetClear("logo")}
          />
          <AssetUpload
            id="signature-upload"
            label="Authorized Signature / Seal"
            value={assets.signature}
            disabled={bulkGenerating || generatingRow !== null}
            onChange={(file) => handleAssetChange("signature", file)}
            onClear={() => handleAssetClear("signature")}
          />
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                {FIELD_DEFINITIONS.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee, index) => (
                <EmployeeRow
                  key={index}
                  columns={FIELD_DEFINITIONS}
                  employee={employee}
                  rowIndex={index}
                  errors={errors}
                  onFieldChange={handleFieldChange}
                  onRemove={handleRemoveRowAt}
                  onPaste={handlePaste}
                  onGenerate={handleGenerateForRow}
                  onPreview={handlePreview}
                  disableRemove={disableRemove}
                  isGenerating={bulkGenerating || generatingRow === index}
                />
              ))}
            </tbody>
          </table>
        </div>
        </section>

        <section className="panel preview-panel">
        <div className="preview-header">
          <h2>Latest Pay Slip Preview</h2>
          {previewData && (
            <button
              className="btn-icon"
              onClick={() => setPreviewData(null)}
              title="Clear preview"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
        <div className="preview-surface">{previewContent}</div>
        </section>
      </main>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setModalType(null);
          setPendingRowIndex(null);
        }}
        title={modalType === "bulk" ? "Generate PDFs for All Employees?" : "Generate PDF?"}
      >
        <div className="modal-body">
          <p className="modal-text">
            {modalType === "bulk"
              ? `This will generate PDF files for all ${employees.length} employee(s). Continue?`
              : "This will generate and download a PDF file for this employee. Continue?"}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={() => setShowModal(false)}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirmGenerate}>
            Generate PDF{modalType === "bulk" ? "s" : ""}
          </button>
        </div>
      </Modal>
    </>
  );

  return (
    <div className="app-shell">
      <div className="tab-switcher">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-switcher__btn${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "payroll" ? payrollLayout : <TechchefInvoiceTab />}
    </div>
  );
}
