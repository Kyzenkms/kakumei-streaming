import { AD_CONFIG } from '../config/ads';

/**
 * Triggers an adult ad popup (Smartlink) in a new tab if cooldown has passed.
 * Safe, seamless, and does not interfere with video playback.
 */
export function triggerAdultAd() {
  if (!AD_CONFIG.enabled || !AD_CONFIG.adult?.enabled) return false;
  
  const url = AD_CONFIG.adult.smartlinkUrl;
  if (!url) return false;

  const now = Date.now();
  const lastTime = parseInt(sessionStorage.getItem('last_adult_ad_ts') || '0', 10);
  const cooldownMs = (AD_CONFIG.adult.popupCooldownSeconds || 180) * 1000;

  if (now - lastTime < cooldownMs) {
    return false; // Still within cooldown
  }

  sessionStorage.setItem('last_adult_ad_ts', String(now));

  try {
    const pop = window.open(url, '_blank', 'noopener,noreferrer');
    if (pop) {
      // Blur popup if browser allows to keep user on site
      pop.blur();
      window.focus();
    }
    return true;
  } catch (e) {
    console.warn('[AdManager] Popup failed or blocked:', e);
    return false;
  }
}

/**
 * Dynamically attaches the Adsterra Popunder and Social Bar scripts
 * exclusively while the user is inside the 18+ section.
 * Removes them when leaving to ensure the rest of the site is 100% ad-free!
 */
export function attachAdultScripts() {
  if (!AD_CONFIG.enabled || !AD_CONFIG.adult?.enabled) return () => {};

  const scriptElements = [];

  // Popunder Script
  if (AD_CONFIG.adult.popunderScript) {
    const s1 = document.createElement('script');
    s1.src = AD_CONFIG.adult.popunderScript;
    s1.async = true;
    s1.dataset.adsterra18 = 'popunder';
    document.head.appendChild(s1);
    scriptElements.push(s1);
  }

  // Social Bar Script
  if (AD_CONFIG.adult.socialBarScript) {
    const s2 = document.createElement('script');
    s2.src = AD_CONFIG.adult.socialBarScript;
    s2.async = true;
    s2.dataset.adsterra18 = 'socialbar';
    document.body.appendChild(s2);
    scriptElements.push(s2);
  }

  // Cleanup function when leaving the 18+ area
  return () => {
    scriptElements.forEach(el => {
      try { el.remove(); } catch (e) {}
    });
    // Remove any leftover Adsterra floating widgets if created
    document.querySelectorAll('[id*="adsterra"], [class*="adsterra"], [id*="container-"]').forEach(el => {
      if (el.dataset.adsterra18) {
        try { el.remove(); } catch (e) {}
      }
    });
  };
}
