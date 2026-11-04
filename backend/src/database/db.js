const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Pool configured for Neon DB and standard PostgreSQL
// Neon requires SSL connection: ssl: { rejectUnauthorized: false }
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'neondb_owner'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'notifai_space'}?sslmode=require`;

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  async getClient() {
    return await pool.connect();
  }
};
