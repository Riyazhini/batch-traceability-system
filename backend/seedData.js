
const db = require("./db");

// Database transaction
const seedDatabase = db.transaction(() => {

    // ----------------------------------
    // 1. INSERT RAW MATERIAL LOTS
    // ----------------------------------

    const rawMaterials = [
        ["R001", "Medical-grade resin", "Supplier A", 500, "DEFECTIVE"],
        ["R002", "Medical-grade polymer", "Supplier B", 300, "GOOD"],
        ["R003", "Tubing additive", "Supplier C", 200, "GOOD"]
    ];

    const insertRaw = db.prepare(`
        INSERT INTO raw_materials
        (lot_id, material_name, supplier_name, quantity_received, status)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const material of rawMaterials) {
        insertRaw.run(...material);
    }

    console.log("Raw material lots inserted.");


    // ----------------------------------
    // 2. INSERT PRODUCTION BATCHES
    // ----------------------------------

    const productionBatches = [
        ["PB101", "2026-10-20"],
        ["PB102", "2026-10-21"],
        ["PB103", "2026-10-22"],
        ["PB104", "2026-10-23"],
        ["PB105", "2026-10-24"]
    ];

    const insertProduction = db.prepare(`
        INSERT INTO production_batches
        (batch_id, production_date)
        VALUES (?, ?)
    `);

    for (const batch of productionBatches) {
        insertProduction.run(...batch);
    }

    console.log("Production batches inserted.");


    // ----------------------------------
    // 3. INSERT MATERIAL CONSUMPTION
    // ----------------------------------

    const consumptionRecords = [
        ["R001", "PB101", 100],
        ["R002", "PB101", 50],
        ["R001", "PB102", 100],
        ["R003", "PB102", 50],
        ["R002", "PB103", 50],
        ["R003", "PB103", 50],
        ["R002", "PB104", 50],
        ["R003", "PB104", 50],
        ["R003", "PB105", 50]
    ];

    const insertConsumption = db.prepare(`
        INSERT INTO material_consumption
        (raw_material_id, production_batch_id, quantity_used)
        VALUES (?, ?, ?)
    `);

    const getRawId = db.prepare(`
        SELECT id FROM raw_materials WHERE lot_id = ?
    `);

    const getProductionId = db.prepare(`
        SELECT id FROM production_batches WHERE batch_id = ?
    `);

    for (const [rawLot, productionBatch, quantity] of consumptionRecords) {
        const raw = getRawId.get(rawLot);
        const production = getProductionId.get(productionBatch);

        insertConsumption.run(raw.id, production.id, quantity);
    }

    console.log("Material consumption records inserted.");


    // ----------------------------------
    // 4. INSERT FINISHED BATCHES
    // ----------------------------------

    const finishedBatches = [
        ["FB201", "Infusion Set", 1000],
        ["FB202", "Infusion Set", 1000],
        ["FB203", "Infusion Set", 1000],
        ["FB204", "Infusion Set", 1000],
        ["FB205", "Infusion Set", 1000]
    ];

    const insertFinished = db.prepare(`
        INSERT INTO finished_batches
        (finished_batch_id, product_name, quantity_produced)
        VALUES (?, ?, ?)
    `);

    for (const batch of finishedBatches) {
        insertFinished.run(...batch);
    }

    console.log("Finished batches inserted.");


    // ----------------------------------
    // 5. INSERT ACTUAL PRODUCTION OUTPUT
    // ----------------------------------

    const productionOutputs = [
        ["PB101", "FB201"],
        ["PB102", "FB202"],
        ["PB103", "FB203"],
        ["PB104", "FB204"],
        ["PB105", "FB205"]
    ];

    const insertOutput = db.prepare(`
        INSERT INTO production_records
        (production_batch_id, finished_batch_id)
        VALUES (?, ?)
    `);

    const getFinishedId = db.prepare(`
        SELECT id FROM finished_batches
        WHERE finished_batch_id = ?
    `);

    for (const [productionBatch, finishedBatch] of productionOutputs) {
        const production = getProductionId.get(productionBatch);
        const finished = getFinishedId.get(finishedBatch);

        insertOutput.run(production.id, finished.id);
    }

    console.log("Actual production output records inserted.");


    // ----------------------------------
    // 6. INSERT BATCH GENEALOGY LINKS
    // ----------------------------------

    // PB102 -> FB202 is intentionally missing.

    const genealogyRecords = [
        ["PB101", "FB201"],
        ["PB103", "FB203"],
        ["PB104", "FB204"],
        ["PB105", "FB205"]
    ];

    const insertGenealogy = db.prepare(`
        INSERT INTO batch_genealogy
        (production_batch_id, finished_batch_id)
        VALUES (?, ?)
    `);

    for (const [productionBatch, finishedBatch] of genealogyRecords) {
        const production = getProductionId.get(productionBatch);
        const finished = getFinishedId.get(finishedBatch);

        insertGenealogy.run(production.id, finished.id);
    }

    console.log("Genealogy links inserted. PB102 -> FB202 is missing.");


    // ----------------------------------
    // 7. GENERATE 5000 SERIAL NUMBERS
    // ----------------------------------

    const insertSerial = db.prepare(`
        INSERT INTO serial_numbers
        (serial_number, finished_batch_id, status)
        VALUES (?, ?, 'IN_STOCK')
    `);

    for (let i = 0; i < 5; i++) {

        const finishedBatchId = `FB${201 + i}`;
        const finished = getFinishedId.get(finishedBatchId);

        for (let j = 1; j <= 1000; j++) {

            const serialNumber =
                `FS${String(i * 1000 + j + 1000).padStart(4, "0")}`;

            insertSerial.run(serialNumber, finished.id);
        }
    }

    console.log("5000 serial numbers generated.");


    // ----------------------------------
    // 8. INSERT CUSTOMERS
    // ----------------------------------

    const customers = [
        ["City Hospital", "HOSPITAL"],
        ["Green Hospital", "HOSPITAL"],
        ["Sunrise Distributor", "DISTRIBUTOR"]
    ];

    const insertCustomer = db.prepare(`
        INSERT INTO customers
        (customer_name, customer_type)
        VALUES (?, ?)
    `);

    for (const customer of customers) {
        insertCustomer.run(...customer);
    }

    console.log("Customer records inserted.");


    // ----------------------------------
    // 9. INSERT SHIPMENTS
    // ----------------------------------

    const shipments = [
        ["SH101", "City Hospital", "FB201", 400],
        ["SH102", "Green Hospital", "FB201", 300],
        ["SH103", "City Hospital", "FB202", 500],
        ["SH104", "Sunrise Distributor", "FB203", 600],
        ["SH105", "Green Hospital", "FB204", 400],
        ["SH106", "Sunrise Distributor", "FB205", 700]
    ];

    const insertShipment = db.prepare(`
        INSERT INTO shipments
        (shipment_id, customer_id, shipment_date)
        VALUES (?, ?, ?)
    `);

    const getCustomerId = db.prepare(`
        SELECT id FROM customers WHERE customer_name = ?
    `);

    const getAvailableSerials = db.prepare(`
        SELECT id, serial_number
        FROM serial_numbers
        WHERE finished_batch_id = ?
        AND status = 'IN_STOCK'
        ORDER BY serial_number
        LIMIT ?
    `);

    const insertShipmentSerial = db.prepare(`
        INSERT INTO shipment_serials
        (shipment_id, serial_number_id)
        VALUES (?, ?)
    `);

    const updateSerialStatus = db.prepare(`
        UPDATE serial_numbers
        SET status = 'SHIPPED'
        WHERE id = ?
    `);

    for (const [
        shipmentId,
        customerName,
        finishedBatch,
        quantity
    ] of shipments) {

        const customer = getCustomerId.get(customerName);
        const finished = getFinishedId.get(finishedBatch);

        const availableSerials = getAvailableSerials.all(
            finished.id,
            quantity
        );

        if (availableSerials.length !== quantity) {
            throw new Error(
                `Insufficient stock for shipment ${shipmentId}`
            );
        }

        const shipment = insertShipment.run(
            shipmentId,
            customer.id,
            "2026-10-25"
        );

        for (const serial of availableSerials) {

            insertShipmentSerial.run(
                shipment.lastInsertRowid,
                serial.id
            );

            updateSerialStatus.run(serial.id);
        }

        console.log(
            `${shipmentId}: ${quantity} units shipped to ${customerName}`
        );
    }

    console.log("Shipment and customer records inserted.");

}); // IMPORTANT: Closes the database transaction


// ----------------------------------
// 10. EXECUTE DATABASE TRANSACTION
// ----------------------------------

try {

    seedDatabase();

    console.log("\n==================================");
    console.log("SAMPLE DATA INSERTED SUCCESSFULLY!");
    console.log("==================================");

} catch (error) {

    console.error("Error inserting sample data:", error.message);

} finally {

    db.close();

}
