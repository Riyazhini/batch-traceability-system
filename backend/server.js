const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Batch Traceability Backend is Running!"
    });
});

app.get("/api/production-batches", (req, res) => {
    const batches = db.prepare(`
        SELECT batch_id AS batchId, production_date AS productionDate
        FROM production_batches
        ORDER BY batch_id
    `).all();

    res.json({ productionBatches: batches });
});

app.post("/api/raw-materials", (req, res) => {
    const { lotId, materialName, supplierName, quantityReceived, consumption } = req.body ?? {};
    const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
    const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

    if (!isNonEmptyString(lotId) || !isNonEmptyString(materialName) || !isNonEmptyString(supplierName)) {
        return res.status(400).json({
            error: "lotId, materialName, and supplierName must be non-empty strings.",
        });
    }

    if (!isPositiveInteger(quantityReceived)) {
        return res.status(400).json({ error: "quantityReceived must be a positive whole number." });
    }

    if (!Array.isArray(consumption) || consumption.length === 0) {
        return res.status(400).json({
            error: "Add at least one production batch and its consumed quantity.",
        });
    }

    const cleanedConsumption = [];
    const seenBatchIds = new Set();
    for (const entry of consumption) {
        if (!entry || !isNonEmptyString(entry.batchId) || !isPositiveInteger(entry.quantityUsed)) {
            return res.status(400).json({
                error: "Each consumption entry needs a production batch ID and positive whole-number quantityUsed.",
            });
        }

        const batchId = entry.batchId.trim();
        if (seenBatchIds.has(batchId)) {
            return res.status(400).json({ error: `Production batch ${batchId} is listed more than once.` });
        }
        seenBatchIds.add(batchId);
        cleanedConsumption.push({ batchId, quantityUsed: entry.quantityUsed });
    }

    const totalConsumed = cleanedConsumption.reduce((total, entry) => total + entry.quantityUsed, 0);
    if (!Number.isSafeInteger(totalConsumed) || totalConsumed > quantityReceived) {
        return res.status(400).json({
            error: "Total material consumption cannot exceed the quantity received.",
        });
    }

    if (db.prepare("SELECT 1 FROM raw_materials WHERE lot_id = ?").get(lotId.trim())) {
        return res.status(409).json({ error: `Material lot ${lotId.trim()} already exists.` });
    }

    const batchLookup = db.prepare("SELECT id FROM production_batches WHERE batch_id = ?");
    for (const entry of cleanedConsumption) {
        if (!batchLookup.get(entry.batchId)) {
            return res.status(400).json({ error: `Production batch ${entry.batchId} was not found.` });
        }
    }

    const createLot = db.transaction(() => {
        const lotResult = db.prepare(`
            INSERT INTO raw_materials
                (lot_id, material_name, supplier_name, quantity_received, status)
            VALUES (?, ?, ?, ?, 'DEFECTIVE')
        `).run(lotId.trim(), materialName.trim(), supplierName.trim(), quantityReceived);

        const insertConsumption = db.prepare(`
            INSERT INTO material_consumption
                (raw_material_id, production_batch_id, quantity_used)
            VALUES (?, ?, ?)
        `);

        for (const entry of cleanedConsumption) {
            const batch = batchLookup.get(entry.batchId);
            insertConsumption.run(lotResult.lastInsertRowid, batch.id, entry.quantityUsed);
        }

        return Number(lotResult.lastInsertRowid);
    });

    try {
        const id = createLot();
        return res.status(201).json({
            lot: {
                lotId: lotId.trim(),
                materialName: materialName.trim(),
                supplierName: supplierName.trim(),
                quantityReceived,
                status: "DEFECTIVE",
            },
            materialConsumption: cleanedConsumption,
            totalConsumed,
            message: "Defective lot and production consumption records created.",
            recordId: id,
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: `Material lot ${lotId.trim()} already exists.` });
        }
        console.error("Unable to create defective raw-material lot:", error);
        return res.status(500).json({ error: "The defective lot could not be saved." });
    }
});

app.get("/api/recalls/:lotId", (req, res) => {
    const lot = db.prepare(`
        SELECT id, lot_id AS lotId, material_name AS materialName,
               supplier_name AS supplierName, quantity_received AS quantityReceived,
               status
        FROM raw_materials
        WHERE lot_id = ?
    `).get(req.params.lotId);

    if (!lot) {
        return res.status(404).json({ error: `Material lot ${req.params.lotId} was not found.` });
    }

    const affectedProduction = db.prepare(`
        SELECT p.id, p.batch_id AS batchId, p.production_date AS productionDate,
               mc.quantity_used AS quantityUsed
        FROM material_consumption mc
        JOIN production_batches p ON p.id = mc.production_batch_id
        WHERE mc.raw_material_id = ?
        ORDER BY p.batch_id
    `).all(lot.id);

    const productionIds = affectedProduction.map((batch) => batch.id);
    const productionOutput = productionIds.length
        ? db.prepare(`
            SELECT p.batch_id AS productionBatchId,
                   f.finished_batch_id AS finishedBatchId,
                   f.product_name AS productName,
                   f.quantity_produced AS quantityProduced,
                   CASE WHEN bg.id IS NULL THEN 0 ELSE 1 END AS genealogyRecorded
            FROM production_batches p
            LEFT JOIN production_records pr ON pr.production_batch_id = p.id
            LEFT JOIN finished_batches f ON f.id = pr.finished_batch_id
            LEFT JOIN batch_genealogy bg
                ON bg.production_batch_id = p.id
                AND bg.finished_batch_id = f.id
            WHERE p.id IN (${productionIds.map(() => "?").join(",")})
            ORDER BY p.batch_id, f.finished_batch_id
        `).all(...productionIds)
        : [];

    const finishedBatchIds = productionOutput
        .map((batch) => batch.finishedBatchId)
        .filter(Boolean);
    const finishedIds = finishedBatchIds.length
        ? db.prepare(`
            SELECT id, finished_batch_id AS finishedBatchId
            FROM finished_batches
            WHERE finished_batch_id IN (${finishedBatchIds.map(() => "?").join(",")})
        `).all(...finishedBatchIds)
        : [];

    const serialDetails = finishedIds.length
        ? db.prepare(`
            SELECT f.finished_batch_id AS finishedBatchId,
                   COUNT(sn.id) AS serialCount,
                   MIN(CAST(SUBSTR(sn.serial_number, 3) AS INTEGER)) AS firstSerialNumber,
                   MAX(CAST(SUBSTR(sn.serial_number, 3) AS INTEGER)) AS lastSerialNumber,
                   SUM(CASE WHEN sn.status = 'SHIPPED' THEN 1 ELSE 0 END) AS shippedUnits,
                   SUM(CASE WHEN sn.status = 'IN_STOCK' THEN 1 ELSE 0 END) AS remainingUnits
            FROM finished_batches f
            LEFT JOIN serial_numbers sn ON sn.finished_batch_id = f.id
            WHERE f.id IN (${finishedIds.map(() => "?").join(",")})
            GROUP BY f.id
            ORDER BY f.finished_batch_id
        `).all(...finishedIds.map((batch) => batch.id))
        : [];

    const shipmentDetails = finishedIds.length
        ? db.prepare(`
            SELECT f.finished_batch_id AS finishedBatchId,
                   c.customer_name AS customerName,
                   c.customer_type AS customerType,
                   COUNT(ss.id) AS shippedUnits,
                   GROUP_CONCAT(DISTINCT s.shipment_id) AS shipmentIds
            FROM finished_batches f
            JOIN serial_numbers sn ON sn.finished_batch_id = f.id
            JOIN shipment_serials ss ON ss.serial_number_id = sn.id
            JOIN shipments s ON s.id = ss.shipment_id
            JOIN customers c ON c.id = s.customer_id
            WHERE f.id IN (${finishedIds.map(() => "?").join(",")})
            GROUP BY f.id, c.id
            ORDER BY f.finished_batch_id, c.customer_name
        `).all(...finishedIds.map((batch) => batch.id))
        : [];

    const missingRecords = [];
    for (const batch of affectedProduction) {
        const outputs = productionOutput.filter((output) => output.productionBatchId === batch.batchId);
        if (outputs.length === 0 || !outputs.some((output) => output.finishedBatchId)) {
            missingRecords.push({
                type: "production_output",
                record: batch.batchId,
                details: `No finished-batch output is recorded for ${batch.batchId}.`,
            });
        }
        for (const output of outputs) {
            if (output.finishedBatchId && !output.genealogyRecorded) {
                missingRecords.push({
                    type: "batch_genealogy",
                    record: `${output.productionBatchId} → ${output.finishedBatchId}`,
                    details: `The production output exists, but its batch genealogy link is missing.`,
                });
            }
        }
    }

    for (const output of productionOutput) {
        if (!output.finishedBatchId) continue;
        const serials = serialDetails.find((batch) => batch.finishedBatchId === output.finishedBatchId);
        if (!serials || serials.serialCount !== output.quantityProduced) {
            missingRecords.push({
                type: "serial_numbers",
                record: output.finishedBatchId,
                details: `Expected ${output.quantityProduced} serial records; found ${serials?.serialCount ?? 0}.`,
            });
        }
    }

    const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

    return res.json({
        lot,
        materialConsumption: affectedProduction.map(({ batchId, productionDate, quantityUsed }) => ({
            batchId,
            productionDate,
            quantityUsed,
        })),
        productionOutput: productionOutput.map(({ productionBatchId, finishedBatchId, productName, quantityProduced, genealogyRecorded }) => ({
            productionBatchId,
            finishedBatchId,
            productName,
            quantityProduced,
            genealogyRecorded: Boolean(genealogyRecorded),
        })),
        serialRanges: serialDetails.map((batch) => ({
            ...batch,
            range: batch.firstSerialNumber === null
                ? null
                : `FS${String(batch.firstSerialNumber).padStart(4, "0")}–FS${String(batch.lastSerialNumber).padStart(4, "0")}`,
        })),
        shipments: shipmentDetails,
        inventory: serialDetails.map(({ finishedBatchId, serialCount, shippedUnits, remainingUnits }) => ({
            finishedBatchId,
            producedUnits: productionOutput.find((output) => output.finishedBatchId === finishedBatchId)?.quantityProduced || 0,
            serialCount,
            shippedUnits,
            remainingUnits,
        })),
        missingRecords,
        summary: {
            affectedProductionBatches: affectedProduction.length,
            finishedBatchCount: finishedBatchIds.length,
            producedUnits: sum(productionOutput, "quantityProduced"),
            shippedUnits: sum(serialDetails, "shippedUnits"),
            remainingUnits: sum(serialDetails, "remainingUnits"),
            customerCount: new Set(shipmentDetails.map((shipment) => shipment.customerName)).size,
            missingRecordCount: missingRecords.length,
        },
    });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});