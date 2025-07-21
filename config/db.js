require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  database: 'sadhanadb',
  port: 3306,
});

module.exports = pool;