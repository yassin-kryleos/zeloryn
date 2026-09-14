import { APP_VERSION, GITHUB_REPO } from '../version';

export interface UpdateCheckResult {
  success: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  error?: string;
}

/**
 * Compare two semver strings (e.g. "0.1.1" vs "0.1.0" or "v0.1.1" vs "0.1.0").
 * Returns true if remote is strictly greater than current.
 */
export function isNewerVersion(remote: string, current: string = APP_VERSION): boolean {
  const cleanRemote = remote.replace(/^v/, '').trim();
  const cleanCurrent = current.replace(/^v/, '').trim();

  const remoteParts = cleanRemote.split('.').map(p => parseInt(p, 10) || 0);
  const currentParts = cleanCurrent.split('.').map(p => parseInt(p, 10) || 0);

  const maxLen = Math.max(remoteParts.length, currentParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = remoteParts[i] || 0;
    const c = currentParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

const CACHE_KEY = 'zeloryn_update_check_cache';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Check GitHub Releases API for newer version of Zeloryn.
 * Caches results in localStorage for 4 hours unless force: true.
 */
export async function checkForAppUpdates(options: { force?: boolean } = {}): Promise<UpdateCheckResult> {
  const fallbackUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;

  if (!options.force && typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
          return parsed.result;
        }
      }
    } catch {
      // Ignore cache parse errors
    }
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      // If rate-limited or offline, handle gracefully
      return {
        success: false,
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        releaseUrl: fallbackUrl,
        error: `GitHub API returned ${response.status}`
      };
    }

    const data = await response.json();
    const latestTag: string = data.tag_name || '';
    const latestVersion = latestTag.replace(/^v/, '');
    const releaseUrl = data.html_url || fallbackUrl;
    const releaseNotes = data.body || '';

    const hasUpdate = isNewerVersion(latestTag, APP_VERSION);

    const result: UpdateCheckResult = {
      success: true,
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      releaseUrl,
      releaseNotes
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          result
        }));
      } catch {
        // Ignore storage errors
      }
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      releaseUrl: fallbackUrl,
      error: err.message || 'Network error checking for updates'
    };
  }
}
