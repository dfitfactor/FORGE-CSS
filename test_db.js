const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:forge@localhost:5432/postgres' });

client.connect()
  .then(() => {
    console.log("Connection successful!");
    return client.query("SELECT 1;");
  })
  .then(res => {
    console.log("Query returned:", res.rows);
    process.exit(0);
  })
  .catch(err => {
    console.error("Connection error:", err.message);
    process.exit(1);
  });
