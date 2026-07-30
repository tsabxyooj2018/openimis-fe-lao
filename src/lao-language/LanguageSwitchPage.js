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
 * apiHeaders() is used rather than a hand-built header set because it carries
 * the CSRF token; without it the backend rejects the mutation with 'csrftoken'.
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
    const mutation = `mutation {
      changeUserLanguage(input: {languageId: "${code}", clientMutationId: "lang-${Date.now()}"}) {
        clientMutationId
      }
    }`;

    fetch(`${baseApiUrl}/graphql`, {
      method: "POST",
      headers: apiHeaders(),
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
