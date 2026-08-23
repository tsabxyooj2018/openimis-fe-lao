/*
 * Applying a language change.
 *
 * The CSRF handling this needs -- mint a token, retry once when the cached one
 * has outlived its session -- is identical to what every other call to
 * /api/graphql needs, so it lives in helpers/csrf.js and both use it. It was
 * written here first, for this mutation; the membership cards page then failed
 * with a bare 'HTTP_X_CSRFTOKEN' because it did not have the same handling, and
 * that is the argument for one implementation rather than two.
 */
import { graphql } from "../helpers/csrf";

export const LANGUAGE_STORAGE_KEY = "lao.currentLanguage";

/**
 * Applies the language and resolves once the backend has accepted it.
 * The caller decides when to reload; dictionaries are built at startup, so the
 * new language only appears after a fresh boot.
 */
export async function applyLanguage(code) {
  await graphql(`mutation {
    changeUserLanguage(input: {languageId: "${code}", clientMutationId: "lang-${Date.now()}"}) {
      clientMutationId
    }
  }`);

  // Only recorded once the backend accepted it, so the toolbar cannot claim a
  // language that was not applied.
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (error) {
    /* private mode */
  }
  return code;
}
