// ---------------------------------------------------------
        // VENDOR FETCH WITH SMART TEXT DETECTOR (UPGRADED)
        // ---------------------------------------------------------
        let upstreamRes;
        try {
            upstreamRes = await fetch(fetchUrl);
        } catch (e) {
            return res.status(502).json({ 
                error: "Upstream Error", 
                message: "The vendor connection timed out." 
            });
        }
        
        // 1. Read the raw text first
        const rawText = await upstreamRes.text();
        let data;
        
        try {
            // 2. Try to parse it as JSON
            data = JSON.parse(rawText);
            
            // 🚨 THE FIX: If it parses but is just a string (like "Not Found") instead of an object, force an error!
            if (typeof data !== 'object' || data === null) {
                throw new Error("Response is a primitive string, not an object");
            }
            
        } catch(e) {
            // 3. Catch invalid JSON AND primitive strings
            // Strip the double quotes off the string so it looks clean
            const cleanText = rawText.replace(/(^"|"$)/g, '').trim(); 
            const isHtml = cleanText.startsWith('<') || cleanText.toLowerCase().includes('<!doctype');
            
            const dynamicMessage = (!isHtml && cleanText.length > 0 && cleanText.length < 150) 
                ? cleanText 
                : "The upstream data provider returned an invalid format. Ensure your query is correct.";

            const errResponse = {
                error: "Vendor API Error",
                message: dynamicMessage
            };

            if (verifyData.branding && Object.keys(verifyData.branding).length > 0) {
                errResponse._provider_info = {
                    developer: verifyData.branding.developer,
                    official_channel: verifyData.branding.channel
                };
            }

            return res.status(upstreamRes.status === 404 ? 404 : 502).json(errResponse);
        }
        // ---------------------------------------------------------
