import React from "react";
import { photoUrl, locationLine } from "./api";
import emblem from "../emblem-moh.png";

/*
 * One CBHI membership card, at CR80 (85.6 x 54 mm) -- the ID-1 size every card
 * wallet, laminating pouch and card printer is built around.
 *
 * The card is laid out in millimetres rather than pixels or rem. A screen unit
 * would be resolution-dependent and would not survive the trip to a printer;
 * mm is the same on every device and is what the pouch is specified in. Nothing
 * here scales with the browser font size for the same reason -- a user with a
 * larger default font must not get a card that no longer fits its sleeve.
 *
 * Presentational only: it renders whatever insuree it is handed. Fetching,
 * selection and printing all live in MembershipCardsPage.
 */

/** dd/mm/yyyy, which is how dates are written on Lao official documents. */
const formatDate = (value) => {
  if (!value) return "";
  // Dates arrive as ISO (YYYY-MM-DD). Split rather than parse: new Date() on a
  // bare date string is interpreted as UTC and can print the previous day for
  // anyone east of Greenwich, which is everyone here.
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

const fullName = (insuree) =>
  [insuree?.otherNames, insuree?.lastName].filter(Boolean).join(" ");

/*
 * Insurance numbers are read aloud, copied onto forms and typed into the
 * system, so they are grouped in fours. Grouping is display only -- the value
 * underneath is untouched.
 */
const groupNumber = (chfId) =>
  String(chfId ?? "").replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

const Field = ({ label, value }) => (
  <div className="cbhi-card__field">
    <span className="cbhi-card__label">{label}</span>
    <span className="cbhi-card__value">{value || "—"}</span>
  </div>
);

const MembershipCard = ({ insuree, labels }) => {
  const photo = photoUrl(insuree?.photo);
  const gender = insuree?.gender?.code;

  return (
    <article className="cbhi-card">
      <header className="cbhi-card__header">
        <img className="cbhi-card__emblem" src={emblem} alt="" />
        <div className="cbhi-card__titles">
          <div className="cbhi-card__scheme">{labels.scheme}</div>
          <div className="cbhi-card__schemeEn">{labels.schemeEn}</div>
        </div>
      </header>

      <div className="cbhi-card__body">
        {/* The frame is drawn whether or not there is a photograph, so a card
            without one keeps the same layout instead of collapsing. */}
        <div className="cbhi-card__photo">
          {photo ? (
            <img src={photo} alt="" />
          ) : (
            <span className="cbhi-card__noPhoto">{labels.noPhoto}</span>
          )}
        </div>

        <div className="cbhi-card__details">
          <div className="cbhi-card__name">{fullName(insuree)}</div>
          <div className="cbhi-card__number">{groupNumber(insuree?.chfId)}</div>
          <Field label={labels.dob} value={formatDate(insuree?.dob)} />
          <Field label={labels.gender} value={gender ? labels.genders[gender] ?? gender : ""} />
          <Field label={labels.location} value={locationLine(insuree)} />
        </div>
      </div>

      <footer className="cbhi-card__footer">
        <span>{labels.footer}</span>
        {/* Not a validity date: openIMIS holds policy validity on the family's
            policy, not the insuree, so printing one here would need a second
            query per card and could state an expiry the policy does not have.
            The number is what a facility verifies against the system. */}
        <span className="cbhi-card__issued">{labels.verify}</span>
      </footer>
    </article>
  );
};

export default MembershipCard;
