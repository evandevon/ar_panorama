/*
 * FILE GUIDE: js/settings.js  ·  this website's own settings (window.TOUR_SETTINGS)
 * Loaded by: index.html and make.html (before sources.js).
 *
 * driveKey: a Google API key that lets tours download sounds and videos from Google Drive (so they can start by
 *   themselves, loop, and be see-through). Leave it as '' and Drive sounds and videos show in Google's own player.
 *   Make the key in Google Cloud (APIs & Services → Credentials) and lock it down there:
 *     · Application restrictions → Websites → https://YOURNAME.github.io/*
 *     · API restrictions → Restrict key → Google Drive API only
 *   Use a Google account with no billing (no payment card), so nothing can ever be charged.
 *   The key is visible to anyone who looks at this file; the locks above are what keep it safe.
 *   If you copy this website to a different address, make your own key: this one only works at evandevon.github.io.
 */
window.TOUR_SETTINGS = {
  driveKey: 'AIzaSyAd0G8XF_f9LWKq_yRReRNQrrg9JuAzpBE'
};
