/**
 * Embedded (in-app) browser detection.
 *
 * In-app browsers (Telegram, Instagram, Facebook, TikTok, Snapchat, Line)
 * aggressively block popup windows and sometimes wallet iframes — the AGW
 * login modal and external-wallet flows then silently fail. Official
 * wallet-provider guidance (Privy, WalletConnect) for these environments:
 * detect and ask the user to open the page in a real browser.
 *
 * Only signatures of DEFINITIVE in-app browsers are matched — no generic
 * WebView heuristics — to avoid false positives on normal browsers.
 */

const IN_APP_BROWSER_UA = [
  /Telegram/i,
  /Instagram/i,
  /FBAV|FBAN|FBIOS/i, // Facebook in-app
  /Snapchat/i,
  /Musical_ly|TikTok/i,
  /Line\//i,
]

export function isEmbeddedBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return IN_APP_BROWSER_UA.some((re) => re.test(ua))
}
