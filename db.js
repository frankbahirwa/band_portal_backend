const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// Validate required environment variables — allow empty password
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Special handling for DB_PASSWORD: must be defined (even if empty)
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('Missing required environment variable: DB_PASSWORD');
}

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // Can be empty string
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  multipleStatements: false,
  charset: 'utf8mb4'
});

// Test connection at startup and create subscribers table
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully');
    connection.release();
    // Create subscribers table if it doesn't exist
    const createSubscribersTableSQL = `
      CREATE TABLE IF NOT EXISTS subscribers (
        id VARCHAR(32) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    pool.query(createSubscribersTableSQL, (err) => {
      if (err) {
        console.error('❌ Failed to create subscribers table:', err.message);
      } else {
        console.log('✅ Subscribers table ready');
      }
    });
  }
});

module.exports = pool;