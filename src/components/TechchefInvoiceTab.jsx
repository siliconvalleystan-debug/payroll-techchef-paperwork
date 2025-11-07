import React, { useCallback, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import html2pdf from "html2pdf.js";
import toast from "react-hot-toast";
import { formatCurrency, formatDate, parseNumber, sanitiseFilename } from "../utils.js";
import TechchefInvoicePreview from "./TechchefInvoicePreview.jsx";

const DEFAULT_TAX_PERCENT = 12;
const MARKETING_TAX_RATE = DEFAULT_TAX_PERCENT / 100;

function toCad(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return `C$${formatCurrency(Math.max(numeric, 0))}`;
}

function createLineItemId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function parsePercentValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const cleaned = String(value).replace(/[%\s]/g, "");
  if (!cleaned) {
    return null;
  }
  return parseNumber(cleaned);
}

function formatPercentLabel(value) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  const fixed = Number(value.toFixed(2));
  return `${fixed % 1 === 0 ? fixed.toFixed(0) : fixed}%`;
}

function buildInvoiceData(raw) {
  const marketingBase = parseNumber(raw.marketingUnitPrice) ?? 0;
  const lines = [];

  if (raw.marketingUnitPrice !== "") {
    const marketingTaxAmount = marketingBase * MARKETING_TAX_RATE;
    lines.push({
      id: "marketing",
      description: "Techchef Marketing Fee",
      quantity: 1,
      unitPriceDisplay: toCad(marketingBase),
      taxLabel: formatPercentLabel(DEFAULT_TAX_PERCENT),
      amountDisplay: toCad(marketingBase + marketingTaxAmount),
      baseAmount: marketingBase,
      taxAmount: marketingTaxAmount,
    });
  }

  raw.items.forEach((item, index) => {
    const quantity = parseNumber(item.quantity) ?? 0;
    const unitPrice = parseNumber(item.unitPrice) ?? 0;
    const baseAmount = quantity * unitPrice;
    if (!item.description && baseAmount === 0) {
      return;
    }

    const rawTaxPercent = parsePercentValue(item.taxRate);
    const taxPercent = rawTaxPercent === null ? DEFAULT_TAX_PERCENT : Math.max(rawTaxPercent, 0);
    const taxRateDecimal = taxPercent / 100;
    const taxAmount = baseAmount * taxRateDecimal;

    lines.push({
      id: item.id,
      description: item.description || `Custom Item ${index + 1}`,
      quantity: quantity || 0,
      unitPriceDisplay: toCad(unitPrice),
      taxLabel: formatPercentLabel(taxPercent),
      amountDisplay: toCad(baseAmount + taxAmount),
      baseAmount,
      taxAmount,
    });
  });

  const subtotal = lines.reduce((sum, line) => sum + (line.baseAmount ?? 0), 0);
  const taxAmount = lines.reduce((sum, line) => sum + (line.taxAmount ?? 0), 0);
  const total = subtotal + taxAmount;
  const formattedIssueDate = formatDate(raw.dateOfIssue) || raw.dateOfIssue || "-";
  const formattedDueDate = formatDate(raw.dateDue) || raw.dateDue || "-";

  return {
    invoiceNumber: raw.invoiceNumber || "TCH-0001",
    dateOfIssue: formattedIssueDate,
    dateDue: formattedDueDate,
    dueDateHeadline: formattedDueDate === "-" ? "N/A" : formattedDueDate,
    lines,
    subtotalDisplay: toCad(subtotal),
    taxTotalDisplay: toCad(taxAmount),
    totalDisplay: toCad(total),
    amountDueDisplay: toCad(total),
    notes: raw.notes?.trim() ?? "",
  };
}

export default function TechchefInvoiceTab() {
  const [invoice, setInvoice] = useState({
    invoiceNumber: "81872A91-0001",
    dateOfIssue: "",
    dateDue: "",
    marketingUnitPrice: "",
    notes: "",
    items: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const computedInvoice = useMemo(() => buildInvoiceData(invoice), [invoice]);

  const handleFieldChange = useCallback((field, value) => {
    setInvoice((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleAddItem = useCallback(() => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.concat({
        id: createLineItemId(),
        description: "",
        quantity: "1",
        unitPrice: "",
        taxRate: String(DEFAULT_TAX_PERCENT),
      }),
    }));
  }, []);

  const handleItemChange = useCallback((id, key, value) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    }));
  }, []);

  const handleRemoveItem = useCallback((id) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  }, []);

  const handleGenerateInvoice = useCallback(async () => {
    if (!invoice.dateOfIssue || !invoice.dateDue || !invoice.marketingUnitPrice) {
      toast.error("Date of issue, due date, and the marketing fee are required.");
      return;
    }
    const marketingValue = parseNumber(invoice.marketingUnitPrice);
    if (marketingValue === null || marketingValue <= 0) {
      toast.error("Please provide a valid unit price for the Techchef Marketing Fee.");
      return;
    }

    const invoiceData = buildInvoiceData(invoice);

    setIsGenerating(true);
    const loadingToast = toast.loading("Generating Techchef invoice PDF...");

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderToStaticMarkup(<TechchefInvoicePreview data={invoiceData} />);
    const node = wrapper.firstElementChild;
    document.body.appendChild(node);

    const filename = `${sanitiseFilename(`${invoiceData.invoiceNumber}-techchef-invoice`)}.pdf`;
    const options = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
    };

    try {
      await html2pdf().set(options).from(node).save();
      toast.success(`Invoice saved as ${filename}`);
    } catch (error) {
      console.error("Failed to generate Techchef invoice", error);
      toast.error("Unable to generate the invoice PDF. Please try again.");
    } finally {
      toast.dismiss(loadingToast);
      node.remove();
      setIsGenerating(false);
    }
  }, [invoice]);

  return (
    <main className="layout">
      <section className="panel">
        <h1>Techchef Invoice</h1>
        <p className="description">
          Generate invoices that mirror the provided Techchef layout. Enter the key dates, specify the Techchef
          marketing fee, and add any additional descriptions to build the PDF instantly.
        </p>

        <div className="invoice-form-grid">
          <label className="form-field">
            <span>Invoice Number</span>
            <input
              type="text"
              value={invoice.invoiceNumber}
              onChange={(event) => handleFieldChange("invoiceNumber", event.target.value)}
              placeholder="81872A91-0001"
            />
          </label>
          <label className="form-field">
            <span>Date of Issue</span>
            <input
              type="date"
              value={invoice.dateOfIssue}
              onChange={(event) => handleFieldChange("dateOfIssue", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Date Due</span>
            <input
              type="date"
              value={invoice.dateDue}
              onChange={(event) => handleFieldChange("dateDue", event.target.value)}
            />
          </label>
        </div>

        <div className="line-item-card">
          <div className="line-item-header">
            <div>
              <h3>Techchef Marketing Fee</h3>
              <p>Quantity fixed to 1 • tax automatically set to 12%</p>
            </div>
          </div>
          <div className="line-item-grid">
            <label className="form-field">
              <span>Unit Price (C$)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={invoice.marketingUnitPrice}
                onChange={(event) => handleFieldChange("marketingUnitPrice", event.target.value)}
                placeholder="5681.90"
              />
            </label>
          </div>
        </div>

        <div className="line-item-card">
          <div className="line-item-header">
            <div>
              <h3>Additional Description Lines</h3>
              <p>Add other services or notes that should appear on the invoice.</p>
            </div>
            <button type="button" className="btn secondary" onClick={handleAddItem}>
              Add Description
            </button>
          </div>

          {invoice.items.length === 0 && (
            <p className="empty-line-message">No additional descriptions added yet.</p>
          )}

          {invoice.items.map((item) => (
            <div className="other-item-row" key={item.id}>
              <input
                type="text"
                placeholder="Description (e.g., IT Service)"
                value={item.description}
                onChange={(event) => handleItemChange(item.id, "description", event.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="Qty"
                value={item.quantity}
                onChange={(event) => handleItemChange(item.id, "quantity", event.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit Price"
                value={item.unitPrice}
                onChange={(event) => handleItemChange(item.id, "unitPrice", event.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Tax %"
                value={item.taxRate ?? ""}
                onChange={(event) => handleItemChange(item.id, "taxRate", event.target.value)}
              />
              <button type="button" className="btn secondary remove-line" onClick={() => handleRemoveItem(item.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="line-item-card">
          <label className="form-field" style={{ width: "100%" }}>
            <span>Invoice Note / Description</span>
            <textarea
              rows="3"
              placeholder="Optional note that will appear below the line items."
              value={invoice.notes}
              onChange={(event) => handleFieldChange("notes", event.target.value)}
            />
          </label>
        </div>

        <div className="invoice-actions">
          <button type="button" className="btn primary" onClick={handleGenerateInvoice} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate Invoice PDF"}
          </button>
        </div>
      </section>

      <section className="panel preview-panel">
        <div className="preview-header">
          <h2>Invoice Preview</h2>
        </div>
        <div className="preview-surface">
          <TechchefInvoicePreview data={computedInvoice} />
        </div>
      </section>
    </main>
  );
}
