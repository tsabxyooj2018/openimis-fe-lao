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
 * Most templates follow the card already in circulation: an authority band down
 * the left carrying the emblem and the issuing body, the title across the top of
 * the face, then label-colon-value rows, and the barcode along the foot. The
 * point is that someone holding the old card and the new one sees one scheme.
 *
 * The template that carries a photograph, a barcode AND a QR uses a different
 * arrangement, for reasons of measurement rather than taste -- see the note
 * above the banner layout below.
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

  /*
   * The banner layout sets the insurance number once, large, above the rows --
   * so it is left out of the rows themselves rather than printed twice.
   *
   * It is NOT grouped into blocks of three. Grouping reads better aloud and is
   * what a bank card does, but this number gets TYPED, into openIMIS and into
   * a facility's own books, and a card showing 901 011 101 111 is a card that
   * gets entered with spaces in it. Tabular figures and a little tracking give
   * the same legibility without inviting that.
   */
  const banner = template.layout === "banner";

  const rows = (
    <div className="cbhi-card__rows">
      <Row label={labels.name} value={fullName(insuree)} />
      {banner ? null : (
        <div className="cbhi-card__row">
          <span className="cbhi-card__label">{labels.number}</span>
          <span className="cbhi-card__sep">:</span>
          <span className="cbhi-card__value cbhi-card__value--num">{insuree?.chfId}</span>
        </div>
      )}
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

  /*
   * THE BANNER LAYOUT
   *
   * The other templates carry the issuing authority down a band on the left,
   * because the card in circulation does and someone holding both should see
   * one scheme. This one does not, and the reason is measurable rather than a
   * matter of taste.
   *
   * That band spends 20mm of an 85.6mm card, down its full height -- most of a
   * quarter of the face -- to carry three short lines that fit across the top
   * in 10mm. On a template showing a name and a barcode there is room to spare.
   * On this one, which also has to hold a photograph, a QR and a barcode, there
   * is not, and the symptoms were all of a piece: labels wrapping onto a second
   * line, values cut short, and a barcode down to its last usable width.
   *
   * Across the top instead, the body gets the whole card:
   *
   *                    band     banner
   *     label column    13mm     19mm    no longer wraps
   *     value column  ~23.7mm    43.6mm  holds a full name
   *     barcode        59.6mm    79.6mm  0.36 -> 0.48mm a module
   *
   * The last line is the one that matters. ISO/IEC 15417 asks for at least
   * 0.25mm a module; the band layout left this card at 0.36mm, which scans, but
   * has little in hand once an office printer and a laminating pouch have each
   * taken their share. At 0.48mm it can be printed badly and still work.
   */
  if (banner) {
    return (
      <article className={`cbhi-card cbhi-card--${template.id}`}>
        <header className="cbhi-card__banner">
          {/* The emblem sits on a white disc rather than being knocked out to a
              silhouette. It is a colour device and its colours mean something;
              a white chip keeps them and still reads on a dark ground. */}
          <span className="cbhi-card__chip">
            <img src={emblem} alt="" />
          </span>
          <span className="cbhi-card__issuer">
            <span className="cbhi-card__issuer--ministry">{labels.ministry}</span>
            <span className="cbhi-card__issuer--body">{labels.organisation}</span>
          </span>
          <span className="cbhi-card__scheme">
            <span className="cbhi-card__scheme--title">{labels.title}</span>
            <span className="cbhi-card__scheme--abbr">{labels.abbr}</span>
          </span>
        </header>

        <div className="cbhi-card__main">
          <div className="cbhi-card__body">
            {/* Photograph and QR share the left column: the two things someone
                at a counter uses to decide this card belongs to the person
                holding it, kept together and out of the text. */}
            <div className="cbhi-card__aside">
              {template.photo ? (
                <div className="cbhi-card__photo">
                  <Photo key={photo} src={photo} fallback={labels.noPhoto} />
                </div>
              ) : null}
              {template.qr ? <Qr value={insuree?.chfId} /> : null}
            </div>

            {/* Carries min-width: 0 in the stylesheet, and that is load-bearing
                rather than decoration. This is a flex item, so its min-width
                would default to auto -- "never narrower than my content" -- and
                the rows inside are white-space: nowrap. Without it this block
                refuses to shrink, pushes past the card edge, and gets sliced by
                overflow: hidden. Same trap the photograph template hit; the
                long note in cards.css is about that. */}
            <div className="cbhi-card__detail">
              <div className="cbhi-card__hero">
                <span className="cbhi-card__hero--label">{labels.number}</span>
                <span className="cbhi-card__hero--value">{insuree?.chfId || "—"}</span>
              </div>
              {rows}
            </div>
          </div>

          {template.barcode ? <Barcode value={insuree?.chfId} /> : null}
        </div>
      </article>
    );
  }

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
