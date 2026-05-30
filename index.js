export default async function handler(req, res) {
    // Enable CORS so buyers can use your API in web browsers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { key, api, ...extraParams } = req.query;

    // ⚠️ CHANGE THIS TO YOUR ACTUAL PHP HOSTING DOMAIN ⚠️
    const PHP_BACKEND_URL = "https://your-php-domain.com/verify.php"; 
    const BRIDGE_SECRET = "LOFZ_SECRET_5588"; 

    if (!key || !api) {
        return res.status(400).json({ error: "Missing 'key' or 'api' route parameters." });
    }

    try {
        // 1. Authenticate with your PHP Database
        const verifyReq = await fetch(PHP_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: BRIDGE_SECRET, key, api })
        });
        
        const verifyData = await verifyReq.json();

        // If the PHP DB says Maintenance, Expired, or Limit Hit
        if (verifyData.error) return res.status(403).json({ error: verifyData.error });

        // 2. Build the Upstream URL
        const qParam = verifyData.query_param || 'query';
        const mainQueryValue = extraParams[qParam] ? encodeURIComponent(extraParams[qParam]) : '';

        let fetchUrl = verifyData.target_url;
        if (fetchUrl.includes('[QUERY]')) {
            fetchUrl = fetchUrl.replace('[QUERY]', mainQueryValue);
        }

        // 3. Unlimited Extra Queries Feature
        if (verifyData.forward_all) {
            try {
                const urlObj = new URL(fetchUrl);
                for (const k in extraParams) {
                    if (k === qParam && verifyData.target_url.includes('[QUERY]')) continue;
                    urlObj.searchParams.append(k, extraParams[k]);
                }
                fetchUrl = urlObj.toString();
            } catch (e) {
                console.error("URL parsing failed for forwarding queries");
            }
        }

        // 4. Fetch the raw data from the vendor
        const upstreamRes = await fetch(fetchUrl);
        if (!upstreamRes.ok) return res.status(502).json({ error: "Upstream API provider error." });
        
        let data = await upstreamRes.json();

        // 5. Recursive Watermark Stripper
        const keysToRemove = verifyData.remove_keys || [];
        const cleanData = (obj) => {
            if (Array.isArray(obj)) return obj.map(cleanData);
            if (obj !== null && typeof obj === 'object') {
                for (let k in obj) {
                    if (keysToRemove.includes(k)) {
                        delete obj[k]; 
                    } else {
                        obj[k] = cleanData(obj[k]); 
                    }
                }
            }
            return obj;
        };

        data = cleanData(data);

        // 6. Dynamic Branding Injector
        const branding = verifyData.branding;
        if (branding && Object.keys(branding).length > 0) {
            if (branding.show_channel) data.channel = branding.channel;
            if (branding.show_desc) data.description = branding.description;
        }

        // Output final clean JSON
        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ error: "Gateway Edge Error", details: err.message });
    }
}