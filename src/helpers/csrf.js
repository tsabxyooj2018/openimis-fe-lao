/*
 * Talking to /api/graphql with the CSRF token openIMIS demands.
 *
 * The backend checks the token in core/schema.py:
 *
 *   session_csrf = request.session['csrftoken']
 *   request_csrf = request.META['HTTP_X_CSRFTOKEN']
 *   if session_csrf != request_csrf: PermissionDenied
 *
 * READ-ONLY QUERIES ARE NOT EXEMPT. That is worth stating because it is the
 * opposite of the usual convention -- CSRF protects state changes, and a GET-
 * shaped operation normally needs no token -- and assuming the convention here
 * produced a bare KeyError on the header name, surfaced to the user as
 * 'HTTP_X_CSRFTOKEN' with no further explanation.
 *
 * Two properties of the backend drive the retry below.
 *
 * First, django.middleware.csrf.get_token masks the secret with fresh randomness
 * on every call, so each call returns a DIFFERENT string. The comparison is exact
 * equality against whatever the session holds, so only the most recently issued
 * token is valid -- asking for a token silently invalidates the previous one.
 *
 * Second, the token lives in the Django session rather than a cookie, and
 * localStorage outlives the session: Django cycles the session key on login, so
 * after any re-login the cached token belongs to a session that no longer
 * exists. No amount of re-reading the cache fixes that.
 *
 * So a rejected token is refreshed and the call retried once. The cache is still
 * tried first: minting rotates the session value, and doing that on every
 * request for no reason would invalidate the token openIMIS's own requests are
 * about to use.
 *
 * localStorage["csrfToken"] is the same key fe-core reads and writes, so the
 * application and this code cannot drift onto different tokens. The session
 * holds one value; there is one place to keep it.
 */
const CSRF_KEY = "csrfToken";
const API = "/api";

const read = () => {
  try {
    return window.localStorage.getItem(CSRF_KEY);
  } catch (error) {
    return null; // private mode
  }
};

const write = (value) => {
  try {
    window.localStorage.setItem(CSRF_KEY, value);
  } catch (error) {
    /* private mode -- the token simply will not persist */
  }
};

const post = (query, token) =>
  fetch(`${API}/graphql`, {
    method: "POST",
    // The token is compared against the session this cookie identifies, so an
    // unauthenticated request cannot match by construction.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-CSRFToken": token } : {}),
    },
    body: JSON.stringify({ query }),
  });

/** Mints a token, which also stores it in the session server-side. */
export async function mintCsrfToken() {
  const response = await post("mutation { getCsrfToken { csrfToken } }", null);
  const body = await response.json();
  const token = body?.data?.getCsrfToken?.csrfToken;
  if (token) write(token);
  return token || null;
}

/*
 * A rejected token shows up in more than one shape: a tidy "CSRF token missing
 * or incorrect", or the raw KeyError 'HTTP_X_CSRFTOKEN' when the header was
 * absent entirely. Both mean the same thing -- get a fresh token and try again.
 */
const isCsrfFailure = (body, response) =>
  response.status === 403 ||
  (body?.errors ?? []).some((error) => /csrf/i.test(String(error?.message ?? "")));

/**
 * Runs a GraphQL operation, handling the token.
 *
 * @param {string} query a complete GraphQL document
 * @returns {Promise<object>} the parsed response body
 * @throws {Error} on transport failure or a GraphQL error, message first
 */
export async function graphql(query) {
  let token = read() || (await mintCsrfToken());

  let response = await post(query, token);
  let body = await response.json().catch(() => null);

  if (isCsrfFailure(body, response)) {
    // The cache outlived its session. Mint a fresh one -- the backend writes it
    // into the session as it issues it -- so the retry is matched against a
    // value guaranteed to be current.
    token = await mintCsrfToken();
    response = await post(query, token);
    body = await response.json().catch(() => null);
  }

  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  if (body?.errors?.length) throw new Error(body.errors[0].message);
  if (!body) throw new Error("The server returned an empty response");

  return body;
}
