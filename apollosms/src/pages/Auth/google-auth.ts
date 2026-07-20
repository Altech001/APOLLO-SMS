const GOOGLE_REDIRECT_URI_KEY = "renult:google-redirect-uri";

export function getGoogleRedirectUri() {
  return import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/google/callback`;
}

export function rememberGoogleRedirectUri(redirectUri: string) {
  sessionStorage.setItem(GOOGLE_REDIRECT_URI_KEY, redirectUri);
}

export function readGoogleRedirectUri() {
  return sessionStorage.getItem(GOOGLE_REDIRECT_URI_KEY) || getGoogleRedirectUri();
}

export function clearGoogleRedirectUri() {
  sessionStorage.removeItem(GOOGLE_REDIRECT_URI_KEY);
}
