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
 * CSRF, which took three attempts to get right. The backend does not use Django's
 * cookie mechanism at all:
 *
 *   core/schema.py  _check_csrf_token()
 *     session_csrf = request.session['csrftoken']
 *     request_csrf = request.META['HTTP_X_CSRFTOKEN']
 *
 * The token lives in the Django SESSION, and no csrftoken cookie is ever set --
 * the only cookies are JWT and openimis_session, both HttpOnly. The frontend
 * obtains the value through a `getCsrfToken` mutation and caches it in
 * localStorage under "csrfToken"; that is the same value the session holds.
 *
 * So: read localStorage, and ask for one if it is missing. Reading the cookie
 * gave either nothing (KeyError HTTP_X_CSRFTOKEN) or a stale unrelated value
 * ("CSRF token missing or incorrect").
 *
 * apiHeaders() is only Content-Type despite the name; it carries no token.
 *
 * A full reload follows, not a client-side redirect: dictionaries are loaded
 * once at startup, so the new language only takes effect on a fresh boot.
 */
const ALLOWED = ["lo", "en", "fr"];

// The same store openIMIS itself uses. Not exported by fe-core, so read directly.
const cachedCsrf = () => {
  try {
    return window.localStorage.getItem("csrfToken");
  } catch (e) {
    return null;
  }
};

// Mirrors fe-core: ask the backend for a token and cache it. Needed when the
// session was established before this page loaded, or storage was cleared.
async function ensureCsrf() {
  const cached = cachedCsrf();
  if (cached) return cached;
  const res = await fetch(`${baseApiUrl}/graphql`, {
    method: "POST",
    headers: apiHeaders(),
    credentials: "include",
    body: JSON.stringify({ query: "mutation { getCsrfToken { csrfToken } }" }),
  });
  const body = await res.json();
  const token = body?.data?.getCsrfToken?.csrfToken;
  if (token) {
    try {
      window.localStorage.setItem("csrfToken", token);
    } catch (e) {
      /* private mode */
    }
  }
  return token || null;
}

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

    ensureCsrf()
      .then((token) => {
        if (!token) throw new Error("Could not obtain a CSRF token");
        return fetch(`${baseApiUrl}/graphql`, {
          method: "POST",
          headers: { ...apiHeaders(), "X-CSRFToken": token },
          credentials: "include",
          body: JSON.stringify({ query: mutation }),
        });
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
