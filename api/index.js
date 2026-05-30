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

    const PHP_BACKEND_URL = "https://lifeatface.in/works/api/verify.php"; 
    const BRIDGE_SECRET = "LOFZ_SECRET_5588"; 

    if (!key || !api) {
        return res.status(400).json({ 
            error: "Authentication Failed: Missing parameters.",
            message: "You must provide a valid 'key' and an API slug.",
            purchase_api_key: "Contact the developer below to purchase an access key.",
            developer_id: "@YourTelegramID", 
            official_channel: "@LofzAI_Telegram"
        });
    }

    try {
        // 1. PHP DATABASE FETCH (With HTML Detective)
        const verifyReq = await fetch(PHP_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: BRIDGE_SECRET, key, api })
        });
        
        const verifyText = await verifyReq.text(); // Read as raw text first
        let verifyData;
        try {
            verifyData = JSON.parse(verifyText); // Try to convert to JSON
        } catch (e) {
            // If it fails, it means PHP returned HTML!
            return res.status(500).json({ 
                error: "PHP Database Connection Error", 
                reason: "The PHP server returned HTML instead of JSON. This is usually caused by hosting bot-protection (like InfinityFree) or a PHP syntax error.",
                raw_response: verifyText.substring(0, 300) // Show the first 300 characters of the HTML
            });
        }

        if (verifyData.error) return res.status(403).json({ error: verifyData.error });

        // 2. UPSTREAM VENDOR FETCH
        const qParam = verifyData.query_param || 'query';
        const mainQueryValue = extraParams[qParam] ? encodeURIComponent(extraParams[qParam]) : '';

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
                console.error("URL parsing failed for forwarding queries");
            }
        }

        // 3. VENDOR FETCH (With HTML Detective)
        const upstreamRes = await fetch(fetchUrl);
        const upstreamText = await upstreamRes.text(); // Read as raw text first
        
        let data;
        try {
            data = JSON.parse(upstreamText);
        } catch(e) {
            // If it fails, it means the Vendor API returned HTML (like a 404 page)
            return res.status(502).json({
                error: "Upstream Vendor Error",
                reason: "The vendor API returned an HTML webpage instead of JSON. Check if your target URL is correct and your query is not blank.",
                target_url_attempted: fetchUrl,
                raw_response: upstreamText.substring(0, 300)
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

        // Branding
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
