const express = require('express');
const NodeCache = require('node-cache');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Initialize the app
const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json()); // Middleware to parse JSON payloads

// Initialize NodeCache
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Rate limit
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});
app.use(limiter);

// API URLs
const BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';
const ITEM_CATEGORIES_URL = 'https://public-api.easyship.com/2024-09/item_categories';
const AUTH_TOKEN = 'prod_cKYBQyxX68ktfheZdUnAXwwjQcMcLIyZD5miKVymDH0='; // Hardcoded token

// Route to fetch postal codes by ID
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

    const url = `${BASE_URL}${postalCodeId}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        cache.set(postalCodeId, data);
        console.log(`Cache miss, fetched from API for postal code: ${postalCodeId}`);
        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Route to fetch HS codes
app.get('/hs-code', async (req, res, next) => {
    try {
        const response = await fetch(ITEM_CATEGORIES_URL, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${AUTH_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Fetched item categories from Easyship API');
        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Webhook route
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;

        const trackingStatus = payload.tracking_status;
        const platformOrderNumber = trackingStatus.platform_order_number || null;
        const easyshipShipmentId = trackingStatus.easyship_shipment_id || 'Unknown Shipment ID';
        const trackingStatusValue = trackingStatus.status || 'Unknown Status';
        const trackingUrl = trackingStatus.tracking_page_url || 'No Tracking URL';

        const apiURL = 'https://admin-shipping.epispost.com/api/webhooks/orders/easy-ship';

        const response = await fetch(apiURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const apiStatus = response.status;

        const discordMessage = `
**Shipment Tracking Notification - ${easyshipShipmentId}**
Event Type: shipment.tracking.checkpoints.created
Easyship Shipment ID: ${easyshipShipmentId}
Platform Order Number: ${platformOrderNumber || 'Unknown Order Number'}
Origin: AU
Destination: AU
Company Order Number: null
Status: **${trackingStatusValue}**
Tracking Number: ${trackingStatus.tracking_number}
Tracking Page: ${trackingUrl}

API Status:
- ${apiURL} - Status: ${apiStatus}
`;

        const discordWebhookURL = 'https://discord.com/api/webhooks/1289491182782517299/el37SxJALwh5JEpC_FFegCHlunfo1GQPyKEgvtIiTNHZnreiLVTWZA6keQo1Hk1g-KCa';
        await fetch(discordWebhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: discordMessage,
                embeds: [
                    {
                        title: `Shipment Tracking Notification - ${easyshipShipmentId}`,
                        color: 0xff0000,
                        fields: [
                            { name: "Event Type", value: "shipment.tracking.checkpoints.created", inline: false },
                            { name: "Easyship Shipment ID", value: easyshipShipmentId, inline: false },
                            { name: "Platform Order Number", value: platformOrderNumber || 'Unknown Order Number', inline: false },
                            { name: "Origin", value: "AU", inline: false },
                            { name: "Destination", value: "AU", inline: false },
                            { name: "Company Order Number", value: "null", inline: false },
                            { name: "Status", value: trackingStatusValue, inline: false },
                            { name: "Tracking Number", value: trackingStatus.tracking_number, inline: false },
                            { name: "Tracking Page", value: trackingUrl, inline: false },
                            { name: "API Status", value: `${apiURL} - Status: ${apiStatus}`, inline: false },
                        ],
                    },
                ],
            }),
        });

        return res.status(200).send('Payload forwarded and message sent to Discord');
    } catch (error) {
        const discordWebhookURL = 'https://discord.com/api/webhooks/1289491182782517299/el37SxJALwh5JEpC_FFegCHlunfo1GQPyKEgvtIiTNHZnreiLVTWZA6keQo1Hk1g-KCa';
        await fetch(discordWebhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: `Error: ${error.message}`,
            }),
        });

        return res.status(200).send('Error occurred, but returning 200');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(err.status || 500).json({ error: err.message });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit();
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
