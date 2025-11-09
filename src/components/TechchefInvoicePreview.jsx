import React from "react";

const COMPANY_INFO = [
  "Thunder Digital Kitchen Ltd.",
  "200 - 13571 Commerce Pkwy",
  "Richmond, British Columbia V6V 2R2",
  "Canada",
  "+1 647-615-4688",
];

export default function TechchefInvoicePreview({ data }) {
  if (!data) {
    return (
      <div className="preview-placeholder">
        <div>Fill out the invoice form to see the preview</div>
      </div>
    );
  }

  return (
    <div className="techchef-invoice">
      <header className="techchef-invoice__header">
        <div>
          <p className="techchef-invoice__eyebrow">Invoice</p>
          <dl className="techchef-invoice__meta">
            <div>
              <dt>Invoice number</dt>
              <dd>{data.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Date of issue</dt>
              <dd>{data.dateOfIssue}</dd>
            </div>
            <div>
              <dt>Date due</dt>
              <dd>{data.dateDue}</dd>
            </div>
          </dl>
        </div>
        <div className="techchef-wordmark">Thunder Digital Kitchen Ltd.</div>
      </header>

      <div className="techchef-addresses">
        <div>
          {COMPANY_INFO.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div>
          <div className="techchef-address-label">Bill To:</div>
          <div>Techchef</div>
        </div>
      </div>

      <div className="techchef-total-banner">
        <div>
          <span className="techchef-total-amount">{data.totalDisplay}</span>{" "}
          due {data.dueDateHeadline}
        </div>
      </div>

      <div className="techchef-line-table-wrapper">
        <table className="techchef-line-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Tax</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>{line.quantity}</td>
                <td>{line.unitPriceDisplay}</td>
                <td>{line.taxLabel}</td>
                <td>{line.amountDisplay}</td>
              </tr>
            ))}
            {data.lines.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", color: "#94a3b8" }}>
                  Add invoice details to populate this section.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.notes && (
        <div className="techchef-notes">
          <div className="techchef-notes__label">Notes</div>
          <p>{data.notes}</p>
        </div>
      )}

      <div className="techchef-summary">
        <div>
          <span>Subtotal</span>
          <span>{data.subtotalDisplay}</span>
        </div>
        <div>
          <span>Tax Total</span>
          <span>{data.taxTotalDisplay}</span>
        </div>
        <div>
          <span>Total</span>
          <span>{data.totalDisplay}</span>
        </div>
        <div className="techchef-amount-due">
          <span>Amount Due</span>
          <span>{data.amountDueDisplay}</span>
        </div>
      </div>
    </div>
  );
}
