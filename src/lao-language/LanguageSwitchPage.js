import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@material-ui/core";
import { baseApiUrl, apiHeaders } from "@openimis/fe-core";

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
 * CSRF: apiHeaders() returns only Content-Type -- it does NOT carry the token,
 * despite the name. openIMIS reads it from the csrftoken cookie and attaches it
 * explicitly (see login() in fe-core actions.js). Without the X-CSRFToken header
 * the backend raises KeyError 'HTTP_X_CSRFTOKEN', which surfaces as a GraphQL
 * error rather than a 403, so it looks like an application fault.
 *
 * A full reload follows, not a client-side redirect: dictionaries are loaded
 * once at startup, so the new language only takes effect on a fresh boot.
 */
const ALLOWED = ["lo", "en", "fr"];

// Django's CSRF cookie. Read here rather than imported: fe-core keeps
// getCsrfToken() internal and does not export it.
const csrfToken = () => {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
};

const LanguageSwitchPage = (props) => {
  const code = props?.match?.params?.code;
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ALLOWED.includes(code)) {
      setError(`Unknown language "${code}"`);
      return;
    }
    const mutation = `mutation {
      changeUserLanguage(input: {languageId: "${code}", clientMutationId: "lang-${Date.now()}"}) {
        clientMutationId
      }
    }`;

    const token = csrfToken();
    if (!token) {
      setError("Missing CSRF cookie - sign out and back in, then try again.");
      return;
    }

    fetch(`${baseApiUrl}/graphql`, {
      method: "POST",
      headers: { ...apiHeaders(), "X-CSRFToken": token },
      credentials: "include",
      body: JSON.stringify({ query: mutation }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body?.errors?.length) {
          setError(body.errors[0].message);
          return;
        }
        // Record what the backend accepted, so the toolbar button can show the
        // real current language after the reload.
        try {
          window.localStorage.setItem("lao.currentLanguage", code);
        } catch (e) {
          /* private mode - the button just falls back to the default */
        }
        // Full reload so every module's dictionary is re-fetched.
        window.location.assign(process.env.PUBLIC_URL ? `/${process.env.PUBLIC_URL}/` : "/front/");
      })
      .catch((e) => setError(String(e)));
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
