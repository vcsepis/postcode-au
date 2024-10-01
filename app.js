const express = require('express');
const axios = require('axios');
const redis = require('redis');
const rateLimit = require('express-rate-limit');
const axiosRateLimit = require('axios-rate-limit');

// Initialize the app
const app = express();

// Initialize Redis client with the provided Redis URL
const redisClient = redis.createClient({
    url: 'redis://red-crtq91ogph6c73d9nes0:6379'
});

// Handle Redis connection error
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to the Redis server
redisClient.connect().catch(console.error);

// Promisify Redis get and set functions for easier use with async/await
const { promisify } = require('util');
const redisGet = promisify(redisClient.get).bind(redisClient);
const redisSet = promisify(redisClient.set).bind(redisClient);

// Set API base URL
const BASE_URL = 'https://api.easyship.com/api/v1/countries/14/postal_codes/';

// Rate limiter for incoming requests to your API
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // limit each IP to 100 requests per window
});

// Apply rate limiter to all requests
app.use(apiLimiter);

// Limit outgoing API requests to Easyship (e.g., 5 requests per second)
const http = axiosRateLimit(axios.create(), { maxRequests: 5, perMilliseconds: 1000 });

// Route to fetch postal codes by ID
app.get('/postal_codes/:id', async (req, res) => {
    const postalCodeId = req.params.id;

    // Check if data is already in Redis cache
    try {
        const cachedData = await redisGet(postalCodeId);
        if (cachedData) {
            console.log(`Cache hit for postal code: ${postalCodeId}`);
            return res.json(JSON.parse(cachedData));  // Send cached data
        }
    } catch (err) {
        console.error('Redis cache error:', err);
    }

    // Build the API URL
    const url = `${BASE_URL}${postalCodeId}`;

    try {
        // Fetch data from Easyship API with timeout (5 seconds)
        const response = await http.get(url, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000, // Set a 5-second timeout
        });

        // Save API response in Redis with a TTL of 10 minutes (600 seconds)
        await redisSet(postalCodeId, JSON.stringify(response.data), 'EX', 600);

        console.log(`Cache miss, fetched from API for postal code: ${postalCodeId}`);
        res.json(response.data);
    } catch (error) {
        console.error('API request error:', error.message);
        res.status(error.response ? error.response.status : 500).json({
            error: error.response ? error.response.data : error.message,
        });
    }
});

// Start the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
