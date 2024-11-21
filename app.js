// Import required modules
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

// Initialize the app
const app = express();

// Middleware
app.use(express.json());
app.use(require('cors')());
app.use(require('compression')());

// Initialize cache for postal codes
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Constants
const POSTAL_CODE_BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';
const ITEM_CATEGORIES_URL = 'https://public-api.easyship.com/2024-09/item_categories';
const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const FORWARDING_API_URL = 'https://webhook-prod.myepis.cloud/api/v1/webhooks/shipping/orders/easy-ship/result';

// Routes

// 1. Fetch postal codes by ID
app.get('/postal_codes/:id', async (req, res, next) => {
    const postalCodeId = req.params.id;

    if (!/^\d+$/.test(postalCodeId)) {
        return res.status(400).json({ error: 'Invalid postal code ID format' });
    }

    const cachedData = cache.get(postalCodeId);
    if (cachedData) {
        console.log(`Cache hit for postal code: ${postalCodeId}`);
        return res.json(cachedData);
    }

    try {
        const response = await axios.get(`${POSTAL_CODE_BASE_URL}${postalCodeId}`);
        const data = response.data;
        cache.set(postalCodeId, data);
        console.log(`Cache miss, fetched from API for postal code: ${postalCodeId}`);
        res.json(data);
    } catch (error) {
        next(error);
    }
});

// 2. Fetch HS codes
app.get('/hs-code', async (req, res, next) => {
    try {
        const response = await axios.get(ITEM_CATEGORIES_URL, {
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${EASYSHIP_API_KEY}`,
            },
        });
        console.log('Fetched item categories from Easyship API');
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// 3. Handle webhook for label events
app.post('/webhook-label', async (req, res, next) => {
    try {
        const payload = req.body;

        if (!payload.event_type || !payload.label) {
            return res.status(400).json({ error: 'Invalid payload format' });
        }

        const {
            event_type,
            resource_type,
            resource_id,
            label: {
                easyship_shipment_id,
                platform_order_number,
                status,
                label_url,
                tracking_number,
                tracking_page_url,
            },
        } = payload;

        // Forward payload to another API
        let forwardingStatus;
        try {
            const forwardResponse = await axios.post(FORWARDING_API_URL, payload);
            forwardingStatus = `Success - Status: ${forwardResponse.status}`;
        } catch (err) {
            forwardingStatus = `Failed - ${err.message}`;
        }

        // Prepare and send Discord embed
        const discordEmbed = {
            content: null,
            embeds: [
                {
                    title: `Label Event - ${easyship_shipment_id}`,
                    color: status === 'success' ? 0x00ff00 : 0xff0000,
                    fields: [
                        { name: 'Event Type', value: event_type, inline: true },
                        { name: 'Resource Type', value: resource_type, inline: true },
                        { name: 'Resource ID', value: resource_id, inline: true },
                        { name: 'Easyship Shipment ID', value: easyship_shipment_id, inline: false },
                        { name: 'Platform Order Number', value: platform_order_number, inline: false },
                        { name: 'Status', value: status, inline: true },
                        { name: 'Label URL', value: `[Download Label](${label_url})`, inline: false },
                        { name: 'Tracking Number', value: tracking_number, inline: true },
                        { name: 'Tracking Page', value: `[Track Shipment](${tracking_page_url})`, inline: false },
                        { name: 'API Forwarding Status', value: forwardingStatus, inline: false },
                    ],
                },
            ],
        };

        await axios.post(DISCORD_WEBHOOK_URL, discordEmbed);
        res.status(200).send('Payload processed successfully');
    } catch (error) {
        next(error);
    }
});

// 4. Fetch public transport routes
app.post('/public-transport', async (req, res, next) => {
    try {
        const {
            origin,
            destination,
            arrivalTime,
            travelMode,
            computeAlternativeRoutes,
            transitPreferences,
        } = req.body;

        if (!origin || !destination || !arrivalTime || !travelMode || !transitPreferences) {
            return res.status(400).json({
                error: 'Missing required fields: origin, destination, arrivalTime, travelMode, transitPreferences.',
            });
        }

        const googleApiUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

        const headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'routes.legs.steps.transitDetails',
        };

        const payload = {
            origin,
            destination,
            arrivalTime,
            travelMode,
            computeAlternativeRoutes,
            transitPreferences,
        };

        const response = await axios.post(googleApiUrl, payload, { headers });
        res.status(200).json(response.data);
    } catch (error) {
        next(error);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(err.response?.status || 500).json({ error: err.message, details: err.response?.data || null });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
