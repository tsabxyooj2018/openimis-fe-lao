/*
 * Applying a language change. Shared by the toolbar switcher and the
 * /language/:code route, so there is one implementation of the CSRF and mutation
 * handling rather than two that can drift.
 *
 * CSRF, as the backend actually implements it (core/schema.py):
 *
 *   _check_csrf_token()          session_csrf = request.session['csrftoken']
 *                                request_csrf = request.META['HTTP_X_CSRFTOKEN']
 *                                if session_csrf != request_csrf: PermissionDenied
 *
 *   GetCsrfTokenMutation         csrf_token = get_token(info.context)
 *                                info.context.session['csrftoken'] = csrf_token
 *
 * Two consequences drive the retry below.
 *
 * First, django.middleware.csrf.get_token masks the secret with fresh randomness
 * on every call, so each call returns a DIFFERENT string. The comparison is exact
 * equality against whatever the session holds, so only the most recently issued
 * token is ever valid -- asking for a token silently invalidates the previous one.
 *
 * Second, the token lives in the Django session, not a cookie; the only cookies
 * are JWT and openimis_session, both HttpOnly. localStorage, where it is cached,
 * outlives the session: Django cycles the session key on login, so after any
 * re-login the cached token belongs to a session that no longer exists. That is
 * the "CSRF token missing or incorrect." case, and no amount of re-reading the
 * cache fixes it.
 *
 * So a rejected token is refreshed and the mutation retried once, rather than
 * surfaced. The cache is still tried first: minting a token rotates the session
 * value, and doing that on every language change for no reason would invalidate
 * the token openIMIS's own requests are about to use.
 *
 * The refreshed value is written back to localStorage["csrfToken"] -- the same
 * key fe-core reads and writes -- so the app and this module cannot drift onto
 * different tokens. The session holds one value; there is one place to keep it.
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

const post = (body) =>
  fetch(`${API}/graphql`, {
    method: "POST",
    // credentials matter: the token is compared against the session this cookie
    // identifies, so an unauthenticated request cannot match by construction.
    credentials: "include",
    ...body,
  });

/** Mints a token, which also stores it in the session server-side. */
async function mintCsrf() {
  const res = await post({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "mutation { getCsrfToken { csrfToken } }" }),
  });
  const body = await res.json();
  const token = body?.data?.getCsrfToken?.csrfToken;
  if (token) write(CSRF_KEY, token);
  return token || null;
}

/** Runs the mutation. Returns null on success, or the error message. */
async function changeLanguage(code, token) {
  const res = await post({
    headers: { "Content-Type": "application/json", "X-CSRFToken": token },
    body: JSON.stringify({
      query: `mutation {
        changeUserLanguage(input: {languageId: "${code}", clientMutationId: "lang-${Date.now()}"}) {
          clientMutationId
        }
      }`,
    }),
  });
  const body = await res.json();
  return body?.errors?.length ? body.errors[0].message : null;
}

/**
 * Applies the language and resolves once the backend has accepted it.
 * The caller decides when to reload; dictionaries are built at startup, so the
 * new language only appears after a fresh boot.
 */
export async function applyLanguage(code) {
  let token = read(CSRF_KEY) || (await mintCsrf());
  if (!token) throw new Error("Could not obtain a CSRF token");

  let error = await changeLanguage(code, token);

  // A rejected token means the cache outlived its session. Mint a fresh one --
  // which the backend writes into the session as it issues it, so the retry is
  // matched against a value that is guaranteed to be current -- and try again.
  if (error && /csrf/i.test(error)) {
    token = await mintCsrf();
    if (!token) throw new Error("Could not obtain a CSRF token");
    error = await changeLanguage(code, token);
  }

  if (error) throw new Error(error);

  // Only recorded once the backend accepted it, so the toolbar cannot claim a
  // language that was not applied.
  write(LANGUAGE_STORAGE_KEY, code);
  return code;
}
