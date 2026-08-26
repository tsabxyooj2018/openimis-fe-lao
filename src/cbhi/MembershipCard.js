import React from "react";
import { photoUrl } from "./api";
import { code128Svg } from "./barcode";
import { QR_QUIET, qrMatrix } from "./qrcode";
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

/*
 * The QR, drawn as one <rect> per dark module.
 *
 * A path per row would be smaller, but this prints identically and stays
 * readable next to barcode.js above. A version-1 symbol is 21x21, so the worst
 * case is a few hundred rects -- nothing beside the photograph on the same card.
 *
 * shape-rendering: crispEdges matters more than it looks. Without it a browser
 * antialiases the module edges, and a grey half-pixel between two modules is
 * exactly what makes a phone hesitate on a small symbol.
 */
const Qr = ({ value }) => {
  const qr = qrMatrix(value);
  // No number, no QR -- rather than a symbol that scans as an empty string.
  if (!qr) return null;
  const span = qr.size + QR_QUIET * 2;
  return (
    <div className="cbhi-card__qr">
      <svg
        viewBox={`0 0 ${span} ${span}`}
        role="img"
        aria-label={`QR ${value}`}
        shapeRendering="crispEdges"
      >
        <rect x="0" y="0" width={span} height={span} fill="#fff" />
        {qr.dark.map((row, y) =>
          row.map((on, x) =>
            on ? (
              <rect
                key={`${x}-${y}`}
                x={x + QR_QUIET}
                y={y + QR_QUIET}
                width="1"
                height="1"
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
};

/*
 * The photograph, or the empty frame when there isn't one.
 *
 * openIMIS stores a photo two ways -- inline as base64, or as a file under the
 * photos volume -- and the insuree record only says WHICH, never whether the
 * file is actually there. A record can carry a filename whose file was never
 * uploaded, or was lost in a migration, and nothing client-side can tell in
 * advance: the request has to be made to find out.
 *
 * Without onError the browser draws its broken-image glyph, which on a card
 * looks like a printing defect. The empty frame is what an operator expects to
 * see when someone has no photograph on file, and it is what this prints.
 *
 * Keyed on src at the call site, so moving to the next insuree starts over
 * rather than inheriting the previous one's failure.
 */
const Photo = ({ src, fallback }) => {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return <span className="cbhi-card__noPhoto">{fallback}</span>;
  return <img src={src} alt="" onError={() => setFailed(true)} />;
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

      {/* Two blocks and an abbreviation, as the card in circulation sets them:
          the ministry, then the organisation, then the short form at the foot. */}
      <div className="cbhi-card__band">
        <img className="cbhi-card__emblem" src={emblem} alt="" />
        <span className="cbhi-card__authority">{labels.ministry}</span>
        <span className="cbhi-card__authority">{labels.organisation}</span>
        <span className="cbhi-card__abbr">{labels.abbr}</span>
      </div>

      <div className="cbhi-card__main">
        <div className="cbhi-card__title">{labels.title}</div>

        {template.photo || template.qr ? (
          /*
           * Text on the left, photograph and QR stacked on the right, and the
           * barcode below spanning the whole body.
           *
           * The barcode CANNOT share a row with the photograph. Code 128 for a
           * twelve-digit number is 167 modules, and ISO asks for at least
           * 0.25mm per module: across the 59.6mm body that is 0.36mm and
           * comfortable, but squeezed beside a photograph it falls to 0.24 and
           * stops being reliably scannable. That is the constraint that made
           * the earlier templates choose one or the other; stacking is what
           * lets a card carry both.
           */
          <div className="cbhi-card__withPhoto">
            {/* rows already carries .cbhi-card__rows, which is what gets
                min-width: 0 -- wrapping it again would nest a second element
                whose min-width defaults to auto, and the values would be cut
                off exactly as the note in cards.css describes. */}
            {rows}
            <div className="cbhi-card__aside">
              {template.photo ? (
                <div className="cbhi-card__photo">
                  <Photo key={photo} src={photo} fallback={labels.noPhoto} />
                </div>
              ) : null}
              {template.qr ? <Qr value={insuree?.chfId} /> : null}
            </div>
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
