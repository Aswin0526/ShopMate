const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/cities', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_city) as shop_city FROM shops WHERE shop_city IS NOT NULL ORDER BY shop_city';
    const result = await db.query(query);
    const cities = result.rows.map(row => row.shop_city);
    res.json({ success: true, data: cities });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cities' });
  }
});

router.get('/states', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_state) as shop_state FROM shops WHERE shop_state IS NOT NULL ORDER BY shop_state';
    const result = await db.query(query);
    const states = result.rows.map(row => row.shop_state);
    res.json({ success: true, data: states });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
});

router.get('/countries', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_country) as shop_country FROM shops WHERE shop_country IS NOT NULL ORDER BY shop_country';
    const result = await db.query(query);
    const countries = result.rows.map(row => row.shop_country);
    res.json({ success: true, data: countries });
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch countries' });
  }
});

router.get('/shops', async (req, res) => {
  try {
    const { city, state, country } = req.query;
    
    let query = 'SELECT shop_id, shop_name, shop_city, shop_state, shop_country FROM shops WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (city && city !== 'Any' && city !== '') {
      query += ` AND LOWER(shop_city) = LOWER($${paramIndex})`;
      params.push(city);
      paramIndex++;
    }
    
    if (state && state !== 'Any' && state !== '') {
      query += ` AND LOWER(shop_state) = LOWER($${paramIndex})`;
      params.push(state);
      paramIndex++;
    }
    
    if (country && country !== 'Any' && country !== '') {
      query += ` AND LOWER(shop_country) = LOWER($${paramIndex})`;
      params.push(country);
      paramIndex++;
    }
    
    query += ' ORDER BY shop_name';
    
    const result = await db.query(query, params);
    const shops = result.rows.map(row => ({
      id: row.shop_id,
      name: row.shop_name,
      city: row.shop_city,
      state: row.shop_state,
      country: row.shop_country
    }));
    
    res.json({ success: true, data: shops });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shops' });
  }
});

module.exports = router;

