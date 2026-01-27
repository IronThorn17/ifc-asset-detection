const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DB_URL });
module.exports = { pool };
