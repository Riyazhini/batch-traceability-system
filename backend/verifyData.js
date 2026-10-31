
const db = require("./db");

function check(title, query) {
    console.log("\n" + title);
    console.table(db.prepare(query).all());
}

// 1. Raw material lots
check(
    "RAW MATERIALS",
    "SELECT * FROM raw_materials"
);

// 2. Production batches
check(
    "PRODUCTION BATCHES",
    "SELECT * FROM production_batches"
);

// 3. Material consumption
check(
    "MATERIAL CONSUMPTION",
    `SELECT r.lot_id, p.batch_id, mc.quantity_used
     FROM material_consumption mc
     JOIN raw_materials r ON mc.raw_material_id = r.id
     JOIN production_batches p ON mc.production_batch_id = p.id`
);

// 4. Finished batches
check(
    "FINISHED BATCHES",
    "SELECT * FROM finished_batches"
);

// 5. Missing genealogy links
check(
    "MISSING GENEALOGY LINKS",
    `SELECT p.batch_id, f.finished_batch_id
     FROM production_records pr
     JOIN production_batches p
       ON pr.production_batch_id = p.id
     JOIN finished_batches f
       ON pr.finished_batch_id = f.id
     LEFT JOIN batch_genealogy bg
       ON bg.production_batch_id = pr.production_batch_id
       AND bg.finished_batch_id = pr.finished_batch_id
     WHERE bg.id IS NULL`
);

// 6. Customer shipments
check(
    "SHIPMENTS",
    `SELECT s.shipment_id, c.customer_name,
            COUNT(ss.id) AS quantity_shipped
     FROM shipments s
     JOIN customers c ON s.customer_id = c.id
     LEFT JOIN shipment_serials ss ON ss.shipment_id = s.id
     GROUP BY s.id`
);

// 7. Warehouse inventory
check(
    "WAREHOUSE INVENTORY",
    `SELECT f.finished_batch_id,
            COUNT(sn.id) AS warehouse_quantity
     FROM finished_batches f
     LEFT JOIN serial_numbers sn
       ON sn.finished_batch_id = f.id
       AND sn.status = 'IN_STOCK'
     GROUP BY f.id`
);

// 8. Serial number status
check(
    "SERIAL NUMBER COUNT",
    `SELECT status, COUNT(*) AS total
     FROM serial_numbers
     GROUP BY status`
);

db.close();
