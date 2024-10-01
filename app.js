const express = require('express');
const axios = require('axios');

// Initialize the app
const app = express();

// Replace this with your actual Easyship API token
const API_TOKEN = 'your_easyship_api_token';

// Base URL for the Easyship API
const BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';

// Route to fetch postal codes by ID
app.get('/postal_codes/:id', async (req, res) => {
    const postalCodeId = req.params.id;
    const url = `${BASE_URL}${postalCodeId}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
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
