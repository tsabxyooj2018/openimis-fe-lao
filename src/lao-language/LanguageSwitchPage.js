import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@material-ui/core";
import { applyLanguage } from "./switchLanguage";

/*
 * Applies a language change, then returns to the home page.
 *
 * MainMenuContribution entries support only { text, icon, route, withDivider }
 * -- there is no onClick -- so each language is a route, and this page performs
 * the change on mount. That is the extension model openIMIS offers; it needs no
 * fork of fe-core.
 *
 * The mutation contract was read from the live schema rather than guessed:
 *
 *   changeUserLanguage(input: ChangeUserLanguageMutationInput!)
 *   ChangeUserLanguageMutationInput.languageId: String!
 *
 * The request itself, including the CSRF handling that took several attempts to
 * get right, lives in ./switchLanguage so the toolbar switcher and this route
 * cannot drift apart.
 *
 * A full reload follows, not a client-side redirect: dictionaries are loaded
 * once at startup, so the new language only takes effect on a fresh boot.
 */
const ALLOWED = ["lo", "en", "fr"];

const LanguageSwitchPage = (props) => {
  const code = props?.match?.params?.code;
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ALLOWED.includes(code)) {
      setError(`Unknown language "${code}"`);
      return;
    }
    applyLanguage(code)
      .then(() => {
        // Dictionaries are built at startup, so the new language needs a boot.
        window.location.assign("/front/");
      })
      .catch((e) => setError(e.message));
  }, [code]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={6}>
      {!error && (
        <>
          <CircularProgress />
          <Box mt={2}>
            <Typography variant="body2">ກຳລັງປ່ຽນພາສາ… / Changing language…</Typography>
          </Box>
        </>
      )}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default LanguageSwitchPage;
