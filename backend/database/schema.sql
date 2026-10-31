
-- 1. Raw Material Lots
CREATE TABLE IF NOT EXISTS raw_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id TEXT UNIQUE NOT NULL,
    material_name TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    quantity_received INTEGER NOT NULL,
    status TEXT DEFAULT 'GOOD'
);

-- 2. Production Batches
CREATE TABLE IF NOT EXISTS production_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT UNIQUE NOT NULL,
    production_date TEXT NOT NULL
);

-- 3. Material Consumption
CREATE TABLE IF NOT EXISTS material_consumption (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_material_id INTEGER NOT NULL,
    production_batch_id INTEGER NOT NULL,
    quantity_used INTEGER NOT NULL,

    FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)
);

-- 4. Finished Product Batches
CREATE TABLE IF NOT EXISTS finished_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finished_batch_id TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    quantity_produced INTEGER NOT NULL
);

-- 5. Actual Production Output Records
CREATE TABLE IF NOT EXISTS production_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    production_batch_id INTEGER NOT NULL,
    finished_batch_id INTEGER NOT NULL,

    FOREIGN KEY (production_batch_id) REFERENCES production_batches(id),
    FOREIGN KEY (finished_batch_id) REFERENCES finished_batches(id)
);

-- 6. Batch Genealogy Links
CREATE TABLE IF NOT EXISTS batch_genealogy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    production_batch_id INTEGER NOT NULL,
    finished_batch_id INTEGER NOT NULL,

    UNIQUE(production_batch_id, finished_batch_id),

    FOREIGN KEY (production_batch_id) REFERENCES production_batches(id),
    FOREIGN KEY (finished_batch_id) REFERENCES finished_batches(id)
);

-- 7. Individual Serial Numbers
CREATE TABLE IF NOT EXISTS serial_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE NOT NULL,
    finished_batch_id INTEGER NOT NULL,
    status TEXT DEFAULT 'IN_STOCK',

    FOREIGN KEY (finished_batch_id) REFERENCES finished_batches(id)
);

-- 8. Customers (Hospitals and Distributors)
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_type TEXT NOT NULL
);

-- 9. Shipments
CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    shipment_date TEXT NOT NULL,

    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 10. Shipment Serial Numbers
CREATE TABLE IF NOT EXISTS shipment_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    serial_number_id INTEGER NOT NULL,

    UNIQUE(shipment_id, serial_number_id),
    UNIQUE(serial_number_id),

    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (serial_number_id) REFERENCES serial_numbers(id)
);
