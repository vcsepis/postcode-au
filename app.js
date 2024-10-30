const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Initialize the app
const app = express();

// Enable CORS for all origins
app.use(cors());

// Enable compression to reduce response size
app.use(compression());

// Initialize NodeCache with a time-to-live (TTL) of 10 minutes
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Rate limit: 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.'
});
app.use(limiter);

// Base URLs for APIs
const BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';
const ITEM_CATEGORIES_URL = 'https://public-api.easyship.com/2024-09/item_categories';

// Authorization Token (Move to environment variable in production)
const AUTH_TOKEN = 'prod_cKYBQyxX68ktfheZdUnAXwwjQcMcLIyZD5miKVymDH0=';

// Route to fetch postal codes by ID
app.get('/postal_codes/:id', async (req, res) => {
    const postalCodeId = req.params.id;

    const cachedData = cache.get(postalCodeId);
    if (cachedData) {
        console.log(`Cache hit for postal code: ${postalCodeId}`);
        return res.json(cachedData);
    }

    const url = `${BASE_URL}${postalCodeId}`;

    try {
        const response = await axios.get(url, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
        });

        cache.set(postalCodeId, response.data);

        console.log(`Cache miss, fetched from API for postal code: ${postalCodeId}`);
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching postal code ${postalCodeId}: ${error.message}`);
        res.status(error.response ? error.response.status : 500).json({
            error: error.response ? error.response.data : error.message
        });
    }
});

// Route to fetch HS codes (item categories)
app.get('/hs-code', async (req, res) => {
    try {
        const response = await axios.get(ITEM_CATEGORIES_URL, {
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${AUTH_TOKEN}`
            },
            timeout: 5000
        });

        console.log('Fetched item categories from Easyship API');
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching item categories: ${error.message}`);
        res.status(error.response ? error.response.status : 500).json({
            error: error.response ? error.response.data : error.message
        });
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit();
});

// Start the server on port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
