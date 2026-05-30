module.exports = async function(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. EXTRACT THE API SLUG FROM THE URL PATH
    // This grabs "ifsc" from "https://tdnapis.vercel.app/ifsc"
    const host = req.headers.host || 'localhost';
    const urlObj = new URL(req.url, `https://${host}`);
    const pathSlug = urlObj.pathname.replace(/^\/+|\/+$/g, ''); 

    // Extract query parameters
    const { key, api: queryApi, ...extraParams } = req.query;

    // Use the path slug (like /ifsc). If they didn't use a path, fallback to ?api=
    const api = (pathSlug && pathSlug !== 'api') ? pathSlug : queryApi;

    // Connected to your PHP Hosting Domain
    const PHP_BACKEND_URL = "https://lifeatface.in/works/api/verify.php"; 
    const BRIDGE_SECRET = "LOFZ_SECRET_5588"; 

    // Custom Error Message
    if (!key || !api) {
        return res.status(400).json({ 
            error: "Authentication Failed: Missing parameters.",
            message: "You must provide a valid 'key' and an API slug in the URL path (e.g. /ifsc?key=...).",
            purchase_api_key: "Contact the developer below to purchase an access key.",
            developer_id: "@YourTelegramID", 
            official_channel: "@LofzAI_Telegram"
        });
    }

    try {
        // Authenticate with PHP Database
        const verifyReq = await fetch(PHP_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: BRIDGE_SECRET, key, api })
        });
        
        const verifyData = await verifyReq.json();

        // If DB says Maintenance, Expired, or Limit Hit
        if (verifyData.error) return res.status(403).json({ error: verifyData.error });

        // Build the Upstream URL
        const qParam = verifyData.query_param || 'query';
        const mainQueryValue = extraParams[qParam] ? encodeURIComponent(extraParams[qParam]) : '';

        let fetchUrl = verifyData.target_url;
        if (fetchUrl.includes('[QUERY]')) {
            fetchUrl = fetchUrl.replace('[QUERY]', mainQueryValue);
        }

        // Unlimited Extra Queries Feature
        if (verifyData.forward_all) {
            try {
                const fetchUrlObj = new URL(fetchUrl);
                for (const k in extraParams) {
                    if (k === qParam && verifyData.target_url.includes('[QUERY]')) continue;
                    fetchUrlObj.searchParams.append(k, extraParams[k]);
                }
                fetchUrl = fetchUrlObj.toString();
            } catch (e) {
                console.error("URL parsing failed for forwarding queries");
            }
        }

        // Fetch the raw data from the vendor
        const upstreamRes = await fetch(fetchUrl);
        if (!upstreamRes.ok) return res.status(502).json({ error: "Upstream API provider error." });
        
        let data = await upstreamRes.json();

        // Recursive Watermark Stripper
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

        // Dynamic Branding Injector
        const branding = verifyData.branding;
        if (branding && Object.keys(branding).length > 0) {
            if (branding.show_channel) data.channel = branding.channel;
            if (branding.show_desc) data.description = branding.description;
        }

        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ error: "Gateway Edge Error", details: err.message });
    }
}
