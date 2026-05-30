module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const host = req.headers.host || 'localhost';
    const urlObj = new URL(req.url, `https://${host}`);
    const pathSlug = urlObj.pathname.replace(/^\/+|\/+$/g, ''); 

    const { key, api: queryApi, ...extraParams } = req.query;
    const api = (pathSlug && pathSlug !== 'api') ? pathSlug : queryApi;

    // ⚠️ PHP HOSTING DOMAIN ⚠️
    const PHP_BACKEND_URL = "https://lifeatface.in/works/api/verify.php"; 
    const BRIDGE_SECRET = "LOFZ_SECRET_5588"; 

    if (!key || !api) {
        return res.status(400).json({ 
            error: "Authentication Failed: Missing parameters.",
            message: "You must provide a valid 'key' and an API slug.",
            _provider_info: {
                developer: "@YourTelegramID", 
                official_channel: "@LofzAI_Telegram" 
            }
        });
    }

    try {
        const verifyReq = await fetch(PHP_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: BRIDGE_SECRET, key, api })
        });
        
        let verifyData;
        try {
            verifyData = await verifyReq.json();
        } catch (e) {
            return res.status(500).json({ 
                error: "System Error", 
                message: "Unable to connect to master database." 
            });
        }

        if (verifyData.error) {
            // Ensure PHP errors also have a message field if they don't already
            return res.status(403).json({ 
                error: "Access Denied",
                message: verifyData.error 
            });
        }

        // ---------------------------------------------------------
        // UPDATED BLANK QUERY INTERCEPTOR
        // ---------------------------------------------------------
        const qParam = verifyData.query_param || 'query';
        const mainQueryValue = extraParams[qParam] ? encodeURIComponent(extraParams[qParam]) : '';

        // If the query value is completely empty, stop right here and format a clean error.
        if (!mainQueryValue) {
            const errResponse = { 
                error: "Missing Query Parameter",
                message: `No value provided for '${qParam}'. Please include a valid query in the URL.`
            };
            
            // Inject branding if available
            if (verifyData.branding && Object.keys(verifyData.branding).length > 0) {
                errResponse._provider_info = {
                    developer: verifyData.branding.developer,
                    official_channel: verifyData.branding.channel
                };
            }
            return res.status(400).json(errResponse);
        }
        // ---------------------------------------------------------

        let fetchUrl = verifyData.target_url;
        if (fetchUrl.includes('[QUERY]')) {
            fetchUrl = fetchUrl.replace('[QUERY]', mainQueryValue);
        }

        if (verifyData.forward_all) {
            try {
                const fetchUrlObj = new URL(fetchUrl);
                for (const k in extraParams) {
                    if (k === qParam && verifyData.target_url.includes('[QUERY]')) continue;
                    fetchUrlObj.searchParams.append(k, extraParams[k]);
                }
                fetchUrl = fetchUrlObj.toString();
            } catch (e) {
                // Silent fail
            }
        }

        // SECURE VENDOR FETCH (No HTML Exposure)
        let upstreamRes;
        try {
            upstreamRes = await fetch(fetchUrl);
        } catch (e) {
            return res.status(502).json({ 
                error: "Upstream Error", 
                message: "Vendor connection timed out." 
            });
        }
        
        let data;
        try {
            data = await upstreamRes.json();
        } catch(e) {
            return res.status(502).json({
                error: "Vendor Processing Error",
                message: "The upstream data provider returned an invalid format. Ensure your query parameters are correct."
            });
        }
        
        // Watermark Stripper
        const keysToRemove = verifyData.remove_keys || [];
        const cleanData = (obj) => {
            if (Array.isArray(obj)) return obj.map(cleanData);
            if (obj !== null && typeof obj === 'object') {
                for (let k in obj) {
                    if (keysToRemove.includes(k)) delete obj[k]; 
                    else obj[k] = cleanData(obj[k]); 
                }
            }
            return obj;
        };
        data = cleanData(data);

        // SLEEK BRANDING INJECTION
        const branding = verifyData.branding;
        if (branding && Object.keys(branding).length > 0) {
            data._provider_info = {
                developer: branding.developer,
                official_channel: branding.channel
            };
        }

        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ 
            error: "Gateway Edge Error", 
            message: "Connection Failed." 
        });
    }
}
