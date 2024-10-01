const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const compression = require('compression');

// Initialize the app
const app = express();

// Enable compression to reduce response size
app.use(compression());

// Initialize NodeCache with a time-to-live (TTL) of 10 minutes
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Base URL for the Easyship API
const BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';

// Route to fetch postal codes by ID
app.get('/postal_codes/:id', async (req, res) => {
    const postalCodeId = req.params.id;

    // Check if the data is in the cache
    const cachedData = cache.get(postalCodeId);
    if (cachedData) {
        console.log(`Cache hit for postal code: ${postalCodeId}`);
        return res.json(cachedData);  // Return cached data
    }

    const url = `${BASE_URL}${postalCodeId}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Store the API response in cache
        cache.set(postalCodeId, response.data);

        console.log(`Cache miss, fetched from API for postal code: ${postalCodeId}`);
        res.json(response.data);
    } catch (error) {
        res.status(error.response ? error.response.status : 500).json({
            error: error.response ? error.response.data : error.message
        });
    }
});

// Start the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
