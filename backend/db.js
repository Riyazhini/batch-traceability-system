
const Database = require("better-sqlite3");
const path = require("path");

// Create or open the SQLite database
const dbPath = path.join(__dirname, "traceability.db");

const db = new Database(dbPath);

// Enable foreign key validation
db.pragma("foreign_keys = ON");

console.log("Database connected successfully!");

module.exports = db;
