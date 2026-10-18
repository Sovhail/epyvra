interface GeoData {
  country?: string;
  countryCode?: string;
  city?: string;
}

// --- Service 1: ipwho.is ---
interface IpWhoResponse {
    success: boolean;
    country?: string;
    country_code?: string;
    city?: string;
}

async function fetchFromIpWho(ip: string): Promise<GeoData | null> {
  const isLocal = ip === '127.0.0.1' || ip === '::1';
  const requestIp = isLocal ? '' : ip;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(requestIp)}`);
    if (!response.ok) return null;
    const data: IpWhoResponse = await response.json();
    if (data.success && data.country) {
      return {
        country: data.country,
        countryCode: data.country_code,
        city: data.city,
      };
    }
    return null;
  } catch {
    return null;
  }
}


// --- Service 2: freegeoip.app ---
interface FreeGeoIpResponse {
  country_name?: string;
  country_code?: string;
  city?: string;
}

async function fetchFromFreeGeoIp(ip: string): Promise<GeoData | null> {
  const isLocal = ip === '127.0.0.1' || ip === '::1';
  if (isLocal) return null; // This service requires a public IP

  try {
    const response = await fetch(`https://freegeoip.app/json/${encodeURIComponent(ip)}`);
    if (!response.ok) return null;
    const data: FreeGeoIpResponse = await response.json();
    if (data.country_name) {
      return {
        country: data.country_name,
        countryCode: data.country_code,
        city: data.city,
      };
    }
    return null;
  } catch {
    return null;
  }
}


export async function getGeoData(ip: string): Promise<GeoData | null> {
  // The services will be called in this order.
  const services = [
    fetchFromIpWho,
    fetchFromFreeGeoIp
  ];

  for (const service of services) {
    try {
      const data = await service(ip);
      // If we get a result with a country, we return it and stop the chain.
      if (data && data.country) {
        return data;
      }
    } catch {
      // Log the error for the specific service but continue to the next one
      console.warn(`A GeoIP service failed, trying next...`);
    }
  }

  // If all services fail, return null. The UI in the admin panel will handle this.
  return null;
}
