import React from "react";
import { code128Svg } from "./barcode";
import emblem from "../emblem-moh.png";

/*
 * One contribution paid slip, at A5 landscape (210 x 148.5mm) so that exactly
 * two fit an A4 portrait sheet with no waste and one clean cut across the
 * middle. Receipt books are issued in pairs this way already.
 *
 * Sized in millimetres for the same reason the card is: a receipt is a
 * financial document that gets filed, and it has to come out of the printer at
 * a predictable size no matter what the operator has done to their browser
 * zoom.
 *
 * Presentational only. Fetching, selection and printing live in
 * ContributionSlipsPage.
 */

/** dd/mm/yyyy, as Lao official documents write dates. */
const formatDate = (value) => {
  if (!value) return "";
  // Split rather than parse: new Date() on a bare ISO date is read as UTC and
  // prints the previous day for anyone east of Greenwich, which is everyone here.
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

/*
 * Grouped thousands, no decimals.
 *
 * The kip has no subunit in practice -- att exist on paper and are not used --
 * so a contribution is always a whole number, and printing "150000.00" on a
 * receipt would just invite someone to read it as a different figure.
 *
 * Intl is given an explicit grouping rather than a locale, because the result
 * has to be identical on every machine that prints a receipt. A workstation
 * configured for a locale that groups differently, or that renders Lao digits,
 * would otherwise produce a receipt that does not match its neighbour in the
 * book.
 */
const formatAmount = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(number));
};

const fullName = (insuree) =>
  [insuree?.otherNames, insuree?.lastName].filter(Boolean).join(" ");

const Row = ({ label, value }) => (
  <div className="cbhi-slip__row">
    <span className="cbhi-slip__label">{label}</span>
    <span className="cbhi-slip__sep">:</span>
    <span className="cbhi-slip__value">{value || "—"}</span>
  </div>
);

const Barcode = ({ value }) => {
  const svg = code128Svg(value);
  // Null when the value cannot be represented in Code 128B. Better an empty
  // strip than bars that scan as something else.
  if (!svg) return null;
  return (
    <div className="cbhi-slip__barcode">
      <svg
        viewBox={`0 0 ${svg.totalWidth} ${svg.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode ${value}`}
      >
        {svg.bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y="0" width={bar.width} height={svg.height} />
        ))}
      </svg>
      <span className="cbhi-slip__barcodeText">{value}</span>
    </div>
  );
};

const ContributionSlip = ({ contribution, labels, copyLabel }) => {
  const policy = contribution?.policy;
  const head = policy?.family?.headInsuree;

  /*
   * A photo fee is not cover. openIMIS records it as a premium because that is
   * where the money lands, but a receipt that called it a contribution would
   * misdescribe what the payer bought -- so the heading changes.
   */
  const title = contribution?.isPhotoFee ? labels.titlePhotoFee : labels.title;

  return (
    <article className="cbhi-slip">
      <header className="cbhi-slip__head">
        <img className="cbhi-slip__emblem" src={emblem} alt="" />
        <div className="cbhi-slip__authority">
          <span className="cbhi-slip__ministry">{labels.ministry}</span>
          <span className="cbhi-slip__organisation">{labels.organisation}</span>
        </div>
        <div className="cbhi-slip__titleBlock">
          <div className="cbhi-slip__title">{title}</div>
          {/* Which of the pair this is: the payer keeps one, the office files
              the other. Printed rather than written so the two are not mixed up
              after the sheet is cut. */}
          {copyLabel ? <div className="cbhi-slip__copy">{copyLabel}</div> : null}
        </div>
        <div className="cbhi-slip__ref">
          <Row label={labels.receipt} value={contribution?.receipt} />
          <Row label={labels.payDate} value={formatDate(contribution?.payDate)} />
        </div>
      </header>

      <div className="cbhi-slip__body">
        <div className="cbhi-slip__col">
          <Row label={labels.member} value={fullName(head)} />
          <Row label={labels.chfId} value={head?.chfId} />
          <Row label={labels.payer} value={contribution?.payer?.name} />
        </div>
        <div className="cbhi-slip__col">
          <Row label={labels.product} value={policy?.product?.name} />
          <Row
            label={labels.period}
            value={
              policy?.startDate && policy?.expiryDate
                ? `${formatDate(policy.startDate)} — ${formatDate(policy.expiryDate)}`
                : ""
            }
          />
          <Row
            label={labels.payType}
            value={labels.payTypes[contribution?.payType] ?? contribution?.payType}
          />
        </div>
      </div>

      <div className="cbhi-slip__amount">
        <span className="cbhi-slip__amountLabel">{labels.amount}</span>
        <span className="cbhi-slip__amountValue">{formatAmount(contribution?.amount)}</span>
        <span className="cbhi-slip__currency">{labels.currency}</span>
      </div>

      <footer className="cbhi-slip__foot">
        <div className="cbhi-slip__sign">
          <span className="cbhi-slip__signLine" />
          <span className="cbhi-slip__signLabel">{labels.payerSignature}</span>
        </div>
        <Barcode value={contribution?.receipt} />
        <div className="cbhi-slip__sign">
          <span className="cbhi-slip__signLine" />
          <span className="cbhi-slip__signLabel">{labels.collectorSignature}</span>
        </div>
      </footer>
    </article>
  );
};

export default ContributionSlip;
