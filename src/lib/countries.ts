// countries with strong wikimedia landmark coverage
// names use Intl.DisplayNames for proper locale-aware display
const COUNTRY_CODES = [
  "US", "GB", "FR", "DE", "IT", "ES", "JP", "CN", "IN", "BR",
  "AU", "EG", "MX", "GR", "TR", "RU", "TH", "ZA", "PE", "NG",
] as const;

function buildCountryList(): { code: string; name: string }[] {
  try {
    const displayNames = new Intl.DisplayNames(undefined, { type: "region" });
    return COUNTRY_CODES.map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
    }));
  } catch {
    // fallback if Intl.DisplayNames is unavailable
    return COUNTRY_CODES.map((code) => ({ code, name: code }));
  }
}

export const COUNTRIES = buildCountryList().sort((a, b) => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split("-").pop()?.toUpperCase();
    if (a.code === region) return -1;
    if (b.code === region) return 1;
  } catch {
    // ignore
  }
  return a.name.localeCompare(b.name);
});
