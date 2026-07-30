// Lao deployment emblem. Source: https://fdd.gov.la (Department of Food and
// Drug, Ministry of Health), downscaled from 2159px to 512px.
//
// This replaces the openIMIS logo, which was the last visible attribution on
// the login screen once appName was localised. The AGPL credit line is added
// in index.css -- see NOTICE.md.
import defaultLogo from "../emblem-moh.png";

export default function getConfiguredLogo(config, key = 'value') {
  const logoBase64 = config?.["fe-core"]?.logo?.[key];
  if (
    logoBase64 &&
    (logoBase64.startsWith("data:image/png;base64,") ||
     logoBase64.startsWith("data:image/jpeg;base64,") ||
     logoBase64.startsWith("data:image/svg+xml;base64,"))
  ) {
    return logoBase64;
  }
  return defaultLogo;
}
