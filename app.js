const express = require('express');
const NodeCache = require('node-cache');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

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

    try {
        const response = await axios.get(`${BASE_URL}${postalCodeId}`);
        const data = response.data;
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
        const response = await axios.get(ITEM_CATEGORIES_URL, {
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        console.log('Fetched item categories from Easyship API');
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Webhook route for tracking events (old webhook)
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;

        const trackingStatus = payload.tracking_status;
        const platformOrderNumber = trackingStatus.platform_order_number || null;
        const easyshipShipmentId = trackingStatus.easyship_shipment_id || 'Unknown Shipment ID';
        const trackingStatusValue = trackingStatus.status || 'Unknown Status';
        const trackingUrl = trackingStatus.tracking_page_url || 'No Tracking URL';

        const apiURL = 'https://webhook-prod.myepis.cloud/api/v1/webhooks/shipping/orders/easy-ship/result';

        const response = await axios.post(apiURL, payload);
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
        await axios.post(discordWebhookURL, {
            content: discordMessage,
        });

        return res.status(200).send('Payload forwarded and message sent to Discord');
    } catch (error) {
        const discordWebhookURL = 'https://discord.com/api/webhooks/1289491182782517299/el37SxJALwh5JEpC_FFegCHlunfo1GQPyKEgvtIiTNHZnreiLVTWZA6keQo1Hk1g-KCa';
        await axios.post(discordWebhookURL, {
            content: `Error: ${error.message}`,
        });

        return res.status(200).send('Error occurred, but returning 200');
    }
});

// Webhook route for label events (new webhook)
app.post('/webhook-label', async (req, res) => {
    try {
        const payload = req.body;

        // Validate payload structure
        if (!payload.event_type || !payload.label) {
            return res.status(400).json({ error: 'Invalid payload format' });
        }

        // Extract relevant fields
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
                tracking_page_url
            },
        } = payload;

        // Prepare embed for Discord
        const discordEmbed = {
            content: null,
            embeds: [
                {
                    title: `Label Event - ${easyship_shipment_id}`,
                    color: 0x00ff00,
                    fields: [
                        { name: "Event Type", value: event_type, inline: true },
                        { name: "Resource Type", value: resource_type, inline: true },
                        { name: "Resource ID", value: resource_id, inline: true },
                        { name: "Easyship Shipment ID", value: easyship_shipment_id, inline: false },
                        { name: "Platform Order Number", value: platform_order_number, inline: false },
                        { name: "Status", value: status, inline: true },
                        { name: "Label URL", value: `[Download Label](${label_url})`, inline: false },
                        { name: "Tracking Number", value: tracking_number, inline: true },
                        { name: "Tracking Page", value: `[Track Shipment](${tracking_page_url})`, inline: false },
                    ],
                },
            ],
        };

        const discordWebhookURL = 'https://discord.com/api/webhooks/1299383213222920192/n2Jv5ASi0_FIOK2nLxuqxhzIDOsNIgGK5PJbaXM9xRcnNu-UWnSX3x9Ejkjo5qvvwsbI';

        // Send to Discord webhook
        await axios.post(discordWebhookURL, discordEmbed);
        console.log('Sent to Discord webhook');

        // Forward payload to the additional API
        const apiURL = 'https://webhook-prod.myepis.cloud/api/v1/webhooks/shipping/orders/easy-ship/result';
        await axios.post(apiURL, payload);
        console.log('Payload forwarded to external API');

        return res.status(200).send('Payload sent to Discord and external API');
    } catch (error) {
        console.error('Error handling webhook-label:', error.message);

        const discordWebhookURL = 'https://discord.com/api/webhooks/1299383213222920192/n2Jv5ASi0_FIOK2nLxuqxhzIDOsNIgGK5PJbaXM9xRcnNu-UWnSX3x9Ejkjo5qvvwsbI';
        await axios.post(discordWebhookURL, {
            content: `Error: ${error.message}`,
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
