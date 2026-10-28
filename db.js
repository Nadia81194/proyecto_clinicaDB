require('dotenv').config();
const { Pool } = require('pg');

// SSL solo para la nube (Supabase); en local no se usa
const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: esLocal ? false : { rejectUnauthorized: false }
});