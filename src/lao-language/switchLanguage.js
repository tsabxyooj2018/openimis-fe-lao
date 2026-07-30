/*
 * Applying a language change. Shared by the toolbar switcher and the
 * /language/:code route, so there is one implementation of the CSRF and mutation
 * handling rather than two that can drift.
 *
 * CSRF: the backend compares request.session['csrftoken'] with the
 * HTTP_X_CSRFTOKEN header (core/schema.py, _check_csrf_token). The token lives in
 * the Django session and no csrftoken cookie is ever issued -- the only cookies
 * are JWT and openimis_session, both HttpOnly. openIMIS obtains the value with a
 * getCsrfToken mutation and caches it in localStorage under "csrfToken"; this
 * uses the same store and asks for one when it is absent.
 */
export const LANGUAGE_STORAGE_KEY = "lao.currentLanguage";
const CSRF_KEY = "csrfToken";
const API = "/api";

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* private mode */
  }
};

async function ensureCsrf() {
  const cached = read(CSRF_KEY);
  if (cached) return cached;
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query: "mutation { getCsrfToken { csrfToken } }" }),
  });
  const body = await res.json();
  const token = body?.data?.getCsrfToken?.csrfToken;
  if (token) write(CSRF_KEY, token);
  return token || null;
}

/**
 * Applies the language and resolves once the backend has accepted it.
 * The caller decides when to reload; dictionaries are built at startup, so the
 * new language only appears after a fresh boot.
 */
export async function applyLanguage(code) {
  const token = await ensureCsrf();
  if (!token) throw new Error("Could not obtain a CSRF token");

  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": token },
    credentials: "include",
    body: JSON.stringify({
      query: `mutation {
        changeUserLanguage(input: {languageId: "${code}", clientMutationId: "lang-${Date.now()}"}) {
          clientMutationId
        }
      }`,
    }),
  });

  const body = await res.json();
  if (body?.errors?.length) {
    // A rejected token is usually a stale cache; drop it so the next attempt
    // fetches a fresh one rather than failing the same way forever.
    if (/csrf/i.test(body.errors[0].message)) {
      try {
        window.localStorage.removeItem(CSRF_KEY);
      } catch (e) {
        /* ignore */
      }
    }
    throw new Error(body.errors[0].message);
  }

  // Only recorded once the backend accepted it, so the toolbar cannot claim a
  // language that was not applied.
  write(LANGUAGE_STORAGE_KEY, code);
  return code;
}
