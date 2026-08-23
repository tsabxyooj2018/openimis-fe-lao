import React from "react";
import { photoUrl } from "./api";
import { code128Svg } from "./barcode";
import { templateById } from "./templates";
import emblem from "../emblem-moh.png";

/*
 * One CBHI membership card, at CR80 (85.6 x 54 mm) -- the ID-1 size every card
 * wallet, laminating pouch and card printer is built around.
 *
 * The layout follows the card already in circulation: an authority band down the
 * left carrying the emblem and the issuing body, the title across the top of the
 * face, then label-colon-value rows, and the barcode along the foot. The point
 * is that someone holding the old card and the new one sees one scheme.
 *
 * Dimensioned in millimetres throughout. A screen unit is resolution-dependent
 * and does not survive a printer, and anything scaling with the browser font
 * would stop fitting its sleeve for a user who has enlarged their text.
 *
 * Presentational only: it renders whatever it is handed. Fetching, selection and
 * printing live in MembershipCardsPage.
 */

/** dd/mm/yyyy, which is how dates are written on Lao official documents. */
const formatDate = (value) => {
  if (!value) return "";
  // Dates arrive as ISO (YYYY-MM-DD). Split rather than parse: new Date() on a
  // bare date string is read as UTC and prints the previous day for anyone east
  // of Greenwich, which is everyone here.
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

const fullName = (insuree) =>
  [insuree?.otherNames, insuree?.lastName].filter(Boolean).join(" ");

const Row = ({ label, value }) => (
  <div className="cbhi-card__row">
    <span className="cbhi-card__label">{label}</span>
    <span className="cbhi-card__sep">:</span>
    <span className="cbhi-card__value">{value || "—"}</span>
  </div>
);

const Barcode = ({ value }) => {
  const svg = code128Svg(value);
  // Null when the value cannot be represented in Code 128B. Better an empty
  // strip than bars that scan as something else.
  if (!svg) return null;
  return (
    <div className="cbhi-card__barcode">
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
    </div>
  );
};

const MembershipCard = ({ insuree, labels, template: templateId }) => {
  const template = templateById(templateId);
  const gender = insuree?.gender?.code;
  const photo = photoUrl(insuree?.photo);

  const rows = (
    <div className="cbhi-card__rows">
      <Row label={labels.name} value={fullName(insuree)} />
      <div className="cbhi-card__row">
        <span className="cbhi-card__label">{labels.number}</span>
        <span className="cbhi-card__sep">:</span>
        <span className="cbhi-card__value cbhi-card__value--num">{insuree?.chfId}</span>
      </div>
      <Row label={labels.gender} value={gender ? labels.genders[gender] ?? gender : ""} />
      <Row label={labels.dob} value={formatDate(insuree?.dob)} />
      {/* Order follows the card in circulation: entitlement category sits above
          the treating facility, not below it. */}
      {insuree?.productName ? (
        <Row label={labels.category} value={insuree.productName} />
      ) : null}
      <Row label={labels.facility} value={insuree?.healthFacility?.name} />
      {/* Absent rather than blank when the policy could not be read: an empty
          expiry on a card reads as "no cover", which is not what it means. */}
      {insuree?.expiryDate ? (
        <Row label={labels.expiry} value={formatDate(insuree.expiryDate)} />
      ) : null}
    </div>
  );

  return (
    <article className={`cbhi-card cbhi-card--${template.id}`}>
      {/* The ornament is drawn, not photographed, so it stays crisp at any size
          and adds nothing to the image weight of a hundred-card batch. */}
      {template.id === "faithful" || template.id === "photo" ? (
        <svg className="cbhi-card__ornament" viewBox="0 0 856 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <pattern id="cbhi-stupa" x="0" y="0" width="150" height="170" patternUnits="userSpaceOnUse">
              <path d="M75 20 L88 62 L82 62 L96 118 L54 118 L68 62 L62 62 Z" fill="#a8892a" opacity="0.5" />
              <path d="M40 118 h70 v12 h-70 Z M46 138 h58 v10 h-58 Z" fill="#a8892a" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="856" height="540" fill="url(#cbhi-stupa)" />
        </svg>
      ) : null}

      <div className="cbhi-card__band">
        <img className="cbhi-card__emblem" src={emblem} alt="" />
        <span className="cbhi-card__authority">{labels.authority}</span>
        <span className="cbhi-card__abbr">{labels.abbr}</span>
      </div>

      <div className="cbhi-card__main">
        <div className="cbhi-card__title">{labels.title}</div>

        {template.photo ? (
          <div className="cbhi-card__withPhoto">
            <div className="cbhi-card__photo">
              {photo ? <img src={photo} alt="" /> : <span className="cbhi-card__noPhoto">{labels.noPhoto}</span>}
            </div>
            {rows}
          </div>
        ) : (
          rows
        )}

        {template.barcode ? <Barcode value={insuree?.chfId} /> : null}
      </div>
    </article>
  );
};

export default MembershipCard;
