
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Read SQL schema
const schemaPath = path.join(
    __dirname,
    "database",
    "schema.sql"
);

const schema = fs.readFileSync(schemaPath, "utf8");

// Create all database tables
db.exec(schema);

console.log("All database tables created successfully!");

db.close();
