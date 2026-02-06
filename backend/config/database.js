const { Pool } = require("pg");
require("dotenv").config();

console.log(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
  
module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};
