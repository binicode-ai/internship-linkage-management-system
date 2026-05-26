const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "internship",
  password: "binisam",
  port: 5432,
});

module.exports = pool;