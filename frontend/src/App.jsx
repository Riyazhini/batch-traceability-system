import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const numberFormat = new Intl.NumberFormat('en-US')
const emptyLotForm = () => ({
  lotId: '',
  materialName: '',
  supplierName: '',
  quantityReceived: '',
  consumption: [{ batchId: '', quantityUsed: '' }],
})

function formatNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? numberFormat.format(parsed) : '—'
}

function formatDate(value) {
  if (!value) return 'Date not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function App() {
  const [recall, setRecall] = useState(null)
  const [lotQuery, setLotQuery] = useState('R001')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isDefectiveModalOpen, setIsDefectiveModalOpen] = useState(false)
  const [productionBatches, setProductionBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [lotForm, setLotForm] = useState(emptyLotForm)
  const [formError, setFormError] = useState('')
  const [savingLot, setSavingLot] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const dialogRef = useRef(null)

  const loadRecall = useCallback(async (lotId, signal) => {
    setLoading(true)
    setError('')
    setRecall(null)
    try {
      const response = await fetch(`/api/recalls/${encodeURIComponent(lotId)}`, { signal })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || `Unable to load lot ${lotId}.`)
      }
      setRecall(result)
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setRecall(null)
        setError(requestError.message || 'The traceability service is unavailable. Try again.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/recalls/R001', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load lot R001.')
        return result
      })
      .then((result) => {
        if (!controller.signal.aborted) setRecall(result)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || 'The traceability service is unavailable. Try again.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const submitLot = (event) => {
    event.preventDefault()
    const requestedLot = lotQuery.trim()
    if (requestedLot) {
      setSuccessMessage('')
      loadRecall(requestedLot)
    }
  }

  useEffect(() => {
    if (!isDefectiveModalOpen) return undefined

    const controller = new AbortController()
    const previousFocus = document.activeElement

    fetch('/api/production-batches', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load production batches.')
        if (!Array.isArray(result.productionBatches)) {
          throw new Error('The production batch service returned an invalid response.')
        }
        return result.productionBatches
      })
      .then((batches) => {
        if (!controller.signal.aborted) setProductionBatches(batches)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setBatchError(requestError.message || 'Unable to load production batches.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBatchesLoading(false)
      })

    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('input')?.focus()
    })
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsDefectiveModalOpen(false)
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      controller.abort()
      window.cancelAnimationFrame(focusDialog)
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [isDefectiveModalOpen])

  const openDefectiveLotForm = () => {
    setSuccessMessage('')
    setFormError('')
    setLotForm(emptyLotForm())
    setBatchesLoading(true)
    setBatchError('')
    setProductionBatches([])
    setIsDefectiveModalOpen(true)
  }

  const updateConsumption = (index, field, value) => {
    setLotForm((current) => ({
      ...current,
      consumption: current.consumption.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }))
  }

  const addConsumptionRow = () => {
    setLotForm((current) => ({
      ...current,
      consumption: [...current.consumption, { batchId: '', quantityUsed: '' }],
    }))
  }

  const removeConsumptionRow = (index) => {
    setLotForm((current) => ({
      ...current,
      consumption: current.consumption.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  const submitDefectiveLot = async (event) => {
    event.preventDefault()
    setFormError('')
    const quantityReceived = Number(lotForm.quantityReceived)
    const consumptionTotal = lotForm.consumption.reduce(
      (total, row) => total + Number(row.quantityUsed || 0),
      0,
    )
    const selectedBatches = lotForm.consumption.map((row) => row.batchId)

    if (!lotForm.lotId.trim() || !lotForm.materialName.trim() || !lotForm.supplierName.trim()) {
      setFormError('Complete all supplier lot details before saving.')
      return
    }
    if (!Number.isInteger(quantityReceived) || quantityReceived <= 0) {
      setFormError('Total quantity received must be a positive whole number.')
      return
    }
    if (!lotForm.consumption.length || lotForm.consumption.some((row) => (
      !row.batchId || !Number.isInteger(Number(row.quantityUsed)) || Number(row.quantityUsed) <= 0
    ))) {
      setFormError('Select a production batch and enter a positive whole quantity for every consumption row.')
      return
    }
    if (new Set(selectedBatches).size !== selectedBatches.length) {
      setFormError('Each production batch can only appear once.')
      return
    }
    if (consumptionTotal > quantityReceived) {
      setFormError('Total consumption cannot exceed the quantity received.')
      return
    }

    setSavingLot(true)
    try {
      const response = await fetch('/api/raw-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: lotForm.lotId.trim(),
          materialName: lotForm.materialName.trim(),
          supplierName: lotForm.supplierName.trim(),
          quantityReceived,
          consumption: lotForm.consumption.map((row) => ({
            batchId: row.batchId,
            quantityUsed: Number(row.quantityUsed),
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to register the defective lot.')
      const createdLotId = result.lot?.lotId
      if (!createdLotId) throw new Error('The service created the lot but did not return its lot ID.')
      setLotQuery(createdLotId)
      setSuccessMessage(result.message || `Defective lot ${createdLotId} registered successfully.`)
      setIsDefectiveModalOpen(false)
      loadRecall(createdLotId)
    } catch (requestError) {
      setFormError(requestError.message || 'Unable to register the defective lot. Try again.')
    } finally {
      setSavingLot(false)
    }
  }

  const lot = recall?.lot
  const summary = recall?.summary
  const materials = recall?.materialConsumption ?? []
  const outputs = recall?.productionOutput ?? []
  const serialRanges = recall?.serialRanges ?? []
  const shipments = recall?.shipments ?? []
  const inventory = recall?.inventory ?? []
  const gaps = recall?.missingRecords ?? []
  const totalShipped = Number(summary?.shippedUnits ?? 0)
  const totalRemaining = Number(summary?.remainingUnits ?? 0)
  const producedUnits = Number(summary?.producedUnits ?? 0)
  const customerCount = Number(summary?.customerCount ?? new Set(shipments.map((shipment) => shipment.customerName)).size)
  const isCritical = Boolean(lot?.status && lot.status.toLowerCase() !== 'active')
  const stepCount = [
    Boolean(lot),
    materials.length > 0,
    outputs.some((item) => item.finishedBatchId),
    serialRanges.length > 0,
    shipments.length > 0,
    inventory.length > 0,
  ].filter(Boolean).length

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <a className="brand-mark" href="#overview" aria-label="Tracepoint home">
          <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">trace<span>point</span></span>
        </a>
        <div className="rail-divider" />
        <p className="rail-label">WORKSPACE</p>
        <nav className="rail-nav">
          <a className="rail-link active" href="#overview" aria-current="page">
            <span className="rail-icon icon-grid" aria-hidden="true" />
            <span>Investigations</span>
          </a>
          <a className="rail-link" href="#genealogy">
            <span className="rail-icon icon-flow" aria-hidden="true" />
            <span>Genealogy</span>
          </a>
          <a className="rail-link" href="#distribution">
            <span className="rail-icon icon-route" aria-hidden="true" />
            <span>Distribution</span>
          </a>
          <a className="rail-link" href="#reconciliation">
            <span className="rail-icon icon-report" aria-hidden="true" />
            <span>Reports</span>
          </a>
        </nav>
        <div className="rail-bottom">
          <span className="connection-dot" />
          <div>
            <strong>Trace service</strong>
            <span>Connected · v1.4</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Quality operations</span><span className="crumb-slash">/</span><strong>Forward trace</strong>
          </div>
          <div className="topbar-meta">
            <span className="environment"><span /> LIVE SYSTEM</span>
            <span className="user-avatar" aria-label="Signed in as Quality team">QT</span>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" />RECALL RESPONSE / INVESTIGATION 04</p>
              <h1>Forward traceability</h1>
              <p className="page-description">Follow a supplier lot downstream to finished goods, customers, and current stock.</p>
            </div>
            <div className="heading-actions">
              <button className="register-lot-button" type="button" onClick={openDefectiveLotForm}>
                <span aria-hidden="true">＋</span> Register defective lot
              </button>
              <div className="investigation-ref">
                <span className="ref-label">INVESTIGATION</span>
                <span className="ref-value">FT-2024-0081</span>
              </div>
            </div>
          </section>

          <section className="lot-panel" aria-label="Lot investigation">
            <div className="lot-identity">
              <span className="lot-icon" aria-hidden="true">L</span>
              <div>
                <span className="field-label">SUPPLIER LOT</span>
                <div className="lot-title">
                  <strong className="mono">{lot?.lotId || lotQuery || '—'}</strong>
                  {lot && (
                    <span className={`status-pill ${isCritical ? 'status-review' : 'status-ok'}`}>
                      <span />{lot.status || 'Verified'}
                    </span>
                  )}
                  {!lot && !loading && <span className="status-pill status-neutral">Not loaded</span>}
                </div>
                <span className="lot-subtitle">{lot?.materialName || 'Raw material'} <span>·</span> {lot?.supplierName || 'Supplier details pending'}</span>
              </div>
            </div>
            <form className="lot-search" onSubmit={submitLot}>
              <label htmlFor="lot-input" className="field-label">INVESTIGATE ANOTHER LOT</label>
              <div className="search-control">
                <span className="search-mark" aria-hidden="true" />
                <input
                  id="lot-input"
                  value={lotQuery}
                  onChange={(event) => setLotQuery(event.target.value)}
                  placeholder="Enter supplier lot"
                  aria-label="Supplier lot ID"
                />
                <button type="submit" disabled={loading || !lotQuery.trim()}>
                  {loading ? <span className="button-spinner" aria-hidden="true" /> : 'Load lot'}
                </button>
              </div>
            </form>
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <span className="error-symbol" aria-hidden="true">!</span>
              <div><strong>Investigation unavailable</strong><span>{error}</span></div>
              <button type="button" onClick={() => loadRecall(lotQuery.trim() || 'R001')}>Retry</button>
            </div>
          )}

          {successMessage && (
            <div className="success-banner" role="status">
              <span aria-hidden="true">✓</span>
              <p>{successMessage}</p>
              <button type="button" aria-label="Dismiss success message" onClick={() => setSuccessMessage('')}>×</button>
            </div>
          )}

          {loading && !recall ? (
            <section className="loading-panel" role="status" aria-live="polite">
              <span className="loading-ring" aria-hidden="true" />
              <div><strong>Tracing lot {lotQuery || 'R001'}</strong><span>Following material records through production and distribution…</span></div>
            </section>
          ) : !recall && !error ? (
            <section className="empty-panel">
              <span className="empty-mark" aria-hidden="true">—</span>
              <h2>Start a traceability investigation</h2>
              <p>Enter a supplier lot above to view its downstream production, shipments, and inventory.</p>
            </section>
          ) : recall && (
            <>
              <section className="metrics-grid" aria-label="Investigation summary">
                <article className="metric-card metric-primary">
                  <div className="metric-top"><span>AFFECTED PRODUCTION</span><span className="metric-mark mark-batches" aria-hidden="true" /></div>
                  <strong>{formatNumber(summary?.affectedProductionBatches)}</strong>
                  <span className="metric-foot">production batches</span>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>UNITS PRODUCED</span><span className="metric-mark mark-produced" aria-hidden="true" /></div>
                  <strong>{formatNumber(producedUnits)}</strong>
                  <span className="metric-foot">{formatNumber(summary?.finishedBatchCount)} finished batches</span>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>SHIPPED</span><span className="metric-mark mark-shipped" aria-hidden="true" /></div>
                  <strong>{formatNumber(totalShipped)}</strong>
                  <span className="metric-foot">{formatNumber(customerCount)} customer destinations</span>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>IN STOCK</span><span className="metric-mark mark-stock" aria-hidden="true" /></div>
                  <strong>{formatNumber(totalRemaining)}</strong>
                  <span className="metric-foot">units currently accounted for</span>
                </article>
                <article className={`metric-card ${gaps.length ? 'metric-alert' : ''}`}>
                  <div className="metric-top"><span>RECORD GAPS</span><span className="metric-mark mark-gaps" aria-hidden="true" /></div>
                  <strong>{formatNumber(summary?.missingRecordCount ?? gaps.length)}</strong>
                  <span className="metric-foot">{gaps.length ? 'requires evidence review' : 'no gaps identified'}</span>
                </article>
              </section>

              <div className="section-heading trace-heading">
                <div>
                  <p className="eyebrow">LINEAGE OVERVIEW</p>
                  <h2>Material to market</h2>
                </div>
                <span className={`trace-progress ${gaps.length ? 'trace-progress-warning' : ''}`}>
                  {gaps.length
                    ? <><strong>{stepCount}</strong> stages traced · <strong>{formatNumber(gaps.length)}</strong> {gaps.length === 1 ? 'evidence gap' : 'evidence gaps'}</>
                    : <><strong>{stepCount}</strong> / 6 stages documented</>}
                </span>
              </div>

              <section className="trace-strip" aria-label="Six-stage traceability path">
                {[
                  { number: '01', title: 'Supplier lot', detail: lot?.lotId || 'Source material', state: Boolean(lot), target: '#lot-input' },
                  { number: '02', title: 'Consumption', detail: `${materials.length} production ${materials.length === 1 ? 'batch' : 'batches'}`, state: materials.length > 0, target: '#genealogy' },
                  { number: '03', title: 'Production', detail: `${outputs.filter((item) => item.finishedBatchId).length} finished batches`, state: outputs.some((item) => item.finishedBatchId), target: '#genealogy' },
                  { number: '04', title: 'Serials', detail: `${serialRanges.length} serial ranges`, state: serialRanges.length > 0, target: '#serials' },
                  { number: '05', title: 'Shipments', detail: `${formatNumber(customerCount)} ${customerCount === 1 ? 'destination' : 'destinations'}`, state: shipments.length > 0, target: '#distribution' },
                  { number: '06', title: 'Reconcile', detail: gaps.length ? `${gaps.length} evidence ${gaps.length === 1 ? 'gap' : 'gaps'}` : 'Review complete', state: inventory.length > 0, target: '#reconciliation' },
                ].map((step, index) => (
                  <a className={`trace-step ${step.state ? 'step-done' : 'step-pending'} ${index === 5 && gaps.length ? 'step-warning' : ''}`} href={step.target} key={step.number}>
                    <span className="step-node">{step.state && index !== 5 ? <span className="checkmark">✓</span> : step.number}</span>
                    <span className="step-copy"><strong>{step.title}</strong><span>{step.detail}</span></span>
                    {index < 5 && <span className="step-connector" aria-hidden="true" />}
                  </a>
                ))}
              </section>

              {gaps.length > 0 && (
                <section className="gap-banner" aria-labelledby="gap-title">
                  <div className="gap-icon" aria-hidden="true">!</div>
                  <div className="gap-copy">
                    <span className="gap-kicker">ACTION REQUIRED · {gaps.length} {gaps.length === 1 ? 'EVIDENCE GAP' : 'EVIDENCE GAPS'}</span>
                    <h2 id="gap-title">{gaps.some((gap) => gap.type === 'batch_genealogy') ? 'Genealogy link missing' : 'Traceability record incomplete'}</h2>
                    <p>{gaps[0].details}</p>
                  </div>
                  <a href="#genealogy" className="gap-action">Review record <span aria-hidden="true">↗</span></a>
                </section>
              )}

              <div className="detail-grid">
                <div className="primary-column">
                  <section className="content-panel genealogy-panel" id="genealogy">
                    <div className="panel-heading">
                      <div><span className="panel-index">01</span><div><h2>Production genealogy</h2><p>Raw material consumption mapped to finished output</p></div></div>
                      <span className={`panel-status ${gaps.length ? 'panel-status-review' : 'panel-status-ok'}`}><i />{gaps.length ? 'Review required' : 'Verified records'}</span>
                    </div>
                    <div className="genealogy-table-wrap">
                      <table className="genealogy-table">
                        <thead><tr><th>PRODUCTION BATCH</th><th>CONSUMED</th><th>FINISHED OUTPUT</th><th>QUANTITY</th><th>GENEALOGY</th></tr></thead>
                        <tbody>
                          {materials.length === 0 && <tr><td className="table-empty" colSpan="5">No material consumption records were returned for this lot.</td></tr>}
                          {materials.map((material) => {
                            const batchOutputs = outputs.filter((output) => output.productionBatchId === material.batchId)
                            return batchOutputs.length > 0 ? batchOutputs.map((output, outputIndex) => {
                              const hasGap = output.finishedBatchId && !output.genealogyRecorded
                              return (
                                <tr key={`${material.batchId}-${output.finishedBatchId || 'none'}-${outputIndex}`} className={hasGap ? 'row-warning' : ''}>
                                  <td><span className="code-chip">{outputIndex === 0 ? material.batchId : '↳ same batch'}</span>{outputIndex === 0 && <small>{formatDate(material.productionDate)}</small>}</td>
                                  <td>{outputIndex === 0 ? <span className="quantity-value">{formatNumber(material.quantityUsed)} <small>units</small></span> : '—'}</td>
                                  <td>{output.finishedBatchId ? <span className="code-chip output-chip">{output.finishedBatchId}</span> : <span className="muted-cell">No output recorded</span>}</td>
                                  <td>{output.finishedBatchId ? <span className="quantity-value">{formatNumber(output.quantityProduced)} <small>units</small></span> : '—'}</td>
                                  <td>
                                    {hasGap
                                      ? <span className="record-state record-missing"><i />Link missing</span>
                                      : output.finishedBatchId
                                        ? <span className="record-state record-ok"><i />Recorded</span>
                                        : <span className="record-state record-missing"><i />No output</span>}
                                  </td>
                                </tr>
                              )
                            }) : (
                              <tr key={material.batchId} className="row-warning">
                                <td><span className="code-chip">{material.batchId}</span><small>{formatDate(material.productionDate)}</small></td>
                                <td><span className="quantity-value">{formatNumber(material.quantityUsed)} <small>units</small></span></td>
                                <td><span className="muted-cell">No output recorded</span></td><td>—</td>
                                <td><span className="record-state record-missing"><i />No output</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-footer">
                      <span><span className="legend-dot legend-confirmed" />Verified genealogy</span>
                      <span><span className="legend-dot legend-warning" />Evidence gap</span>
                      <span className="table-note">{materials.length} consumption records</span>
                    </div>
                  </section>

                  <section className="content-panel serial-panel" id="serials">
                    <div className="panel-heading">
                      <div><span className="panel-index">02</span><div><h2>Serial number ranges</h2><p>Unit-level identifiers linked to finished batches</p></div></div>
                      <span className="count-badge">{formatNumber(serialRanges.reduce((total, range) => total + Number(range.serialCount || 0), 0))} serials</span>
                    </div>
                    {serialRanges.length ? (
                      <div className="serial-list">
                        {serialRanges.map((range) => (
                          <article className="serial-row" key={range.finishedBatchId}>
                            <span className="serial-stamp" aria-hidden="true">SN</span>
                            <div className="serial-main"><span className="field-label">FINISHED BATCH</span><strong className="mono">{range.finishedBatchId}</strong></div>
                            <div className="serial-range"><span className="field-label">SERIAL RANGE</span><strong className="mono">{range.range || 'Range not recorded'}</strong></div>
                            <div className="serial-total"><strong>{formatNumber(range.serialCount)}</strong><span>units</span></div>
                          </article>
                        ))}
                      </div>
                    ) : <p className="empty-inline">No serial number ranges found for this investigation.</p>}
                  </section>
                </div>

                <div className="secondary-column">
                  <section className="content-panel distribution-panel" id="distribution">
                    <div className="panel-heading">
                      <div><span className="panel-index">03</span><div><h2>Customer distribution</h2><p>Confirmed downstream shipments</p></div></div>
                      <span className="count-badge">{formatNumber(customerCount)} customers</span>
                    </div>
                    {shipments.length ? (
                      <div className="shipment-list">
                        {shipments.map((shipment, index) => (
                          <article className="shipment-row" key={`${shipment.finishedBatchId}-${shipment.customerName}-${index}`}>
                            <span className="destination-mark" aria-hidden="true">{shipment.customerName?.slice(0, 1) || 'C'}</span>
                            <div className="shipment-info">
                              <strong>{shipment.customerName || 'Unspecified customer'}</strong>
                              <span>{shipment.customerType || 'Customer'} <span className="shipment-separator">·</span> <span className="mono">{shipment.finishedBatchId}</span></span>
                              {shipment.shipmentIds && <small className="shipment-ids">{shipment.shipmentIds.split(',').join(' · ')}</small>}
                            </div>
                            <div className="shipment-count"><strong>{formatNumber(shipment.shippedUnits)}</strong><span>units</span></div>
                          </article>
                        ))}
                      </div>
                    ) : <p className="empty-inline">No downstream shipments have been recorded.</p>}
                    <div className="shipment-total"><span>Total units shipped</span><strong>{formatNumber(totalShipped)}</strong></div>
                  </section>

                  <section className="content-panel inventory-panel" id="reconciliation">
                    <div className="panel-heading">
                      <div><span className="panel-index">04</span><div><h2>Inventory reconciliation</h2><p>Produced units versus current disposition</p></div></div>
                    </div>
                    {inventory.length ? (
                      <>
                        <div className="inventory-legend">
                          <span><i className="legend-shipped" />Shipped</span>
                          <span><i className="legend-stock" />In stock</span>
                        </div>
                        <div className="inventory-list">
                          {inventory.map((item) => {
                            const produced = Number(item.producedUnits || 0)
                            const shipped = Number(item.shippedUnits || 0)
                            const remaining = Number(item.remainingUnits || 0)
                            const shippedPercent = produced > 0 ? Math.min((shipped / produced) * 100, 100) : 0
                            const remainingPercent = produced > 0 ? Math.min((remaining / produced) * 100, 100 - shippedPercent) : 0
                            return (
                              <div className="inventory-row" key={item.finishedBatchId}>
                                <div className="inventory-line"><strong className="mono">{item.finishedBatchId}</strong><span>{formatNumber(produced)} produced</span></div>
                                <div className="inventory-bar" role="img" aria-label={`${item.finishedBatchId}: ${formatNumber(shipped)} shipped, ${formatNumber(remaining)} in stock`}>
                                  <span className="inventory-bar-shipped" style={{ width: `${shippedPercent}%` }} />
                                  <span className="inventory-bar-stock" style={{ width: `${remainingPercent}%` }} />
                                </div>
                                <div className="inventory-breakdown"><span>{formatNumber(shipped)} shipped</span><span>{formatNumber(remaining)} in stock</span></div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="inventory-summary"><span>Disposition accounted</span><strong>{formatNumber(totalShipped + totalRemaining)} <small>/ {formatNumber(producedUnits)}</small></strong></div>
                      </>
                    ) : <p className="empty-inline">No inventory disposition records found.</p>}
                  </section>
                </div>
              </div>

              <section className={`report-panel ${gaps.length ? 'report-review' : ''}`} aria-labelledby="report-title">
                <div className="report-symbol" aria-hidden="true">{gaps.length ? '!' : '✓'}</div>
                <div className="report-content">
                  <span className="report-kicker">INVESTIGATION SUMMARY</span>
                  <h2 id="report-title">{gaps.length ? 'Trace is complete with evidence gaps' : 'Downstream trace is reconciled'}</h2>
                  <p>
                    Lot <strong className="mono">{lot?.lotId}</strong> is linked to <strong>{formatNumber(producedUnits)} produced units</strong> across {formatNumber(summary?.finishedBatchCount)} finished batches.{' '}
                    <strong>{formatNumber(totalShipped)} units</strong> are recorded as shipped to {formatNumber(customerCount)} customers, with <strong>{formatNumber(totalRemaining)} units</strong> remaining in inventory.
                    {gaps.length > 0 && <> <strong>{gaps.length} record {gaps.length === 1 ? 'requires' : 'gaps require'} review</strong> before the investigation can be considered fully documented.</>}
                  </p>
                  {gaps.length > 0 && (
                    <ul className="report-gap-list">
                      {gaps.map((gap, index) => <li key={`${gap.type}-${gap.record}-${index}`}><span className="mono">{gap.record}</span><span>{gap.details}</span></li>)}
                    </ul>
                  )}
                </div>
                <div className="report-stamp"><span>GENERATED</span><strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</strong><span>FOR QUALITY REVIEW</span></div>
              </section>
              <footer className="page-footer"><span>Tracepoint · Forward traceability</span><span>Data retrieved from the traceability service</span></footer>
            </>
          )}
        </div>
      </main>
      {isDefectiveModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingLot) setIsDefectiveModalOpen(false)
          }}
        >
          <section
            className="defective-lot-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="defective-lot-title"
            aria-describedby="defective-lot-description"
            ref={dialogRef}
          >
            <header className="dialog-heading">
              <div>
                <p className="eyebrow"><span className="eyebrow-line" />QUALITY RECORD / NEW ENTRY</p>
                <h2 id="defective-lot-title">Register defective lot</h2>
                <p id="defective-lot-description">Record the supplier material and the existing production batches that consumed it.</p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close form"
                disabled={savingLot}
                onClick={() => setIsDefectiveModalOpen(false)}
              >×</button>
            </header>

            <form className="defective-lot-form" onSubmit={submitDefectiveLot}>
              <div className="form-section-label"><span>01</span> SUPPLIER LOT DETAILS</div>
              <div className="lot-form-grid">
                <label className="form-field">
                  <span>Supplier lot ID <i>*</i></span>
                  <input
                    autoComplete="off"
                    required
                    value={lotForm.lotId}
                    onChange={(event) => setLotForm((current) => ({ ...current, lotId: event.target.value }))}
                    placeholder="e.g. SUP-2026-041"
                  />
                </label>
                <label className="form-field">
                  <span>Material name <i>*</i></span>
                  <input
                    required
                    value={lotForm.materialName}
                    onChange={(event) => setLotForm((current) => ({ ...current, materialName: event.target.value }))}
                    placeholder="e.g. Stainless steel coil"
                  />
                </label>
                <label className="form-field">
                  <span>Supplier name <i>*</i></span>
                  <input
                    required
                    value={lotForm.supplierName}
                    onChange={(event) => setLotForm((current) => ({ ...current, supplierName: event.target.value }))}
                    placeholder="Company or supplier"
                  />
                </label>
                <label className="form-field">
                  <span>Total quantity received <i>*</i></span>
                  <span className="quantity-input-wrap">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={lotForm.quantityReceived}
                      onChange={(event) => setLotForm((current) => ({ ...current, quantityReceived: event.target.value }))}
                      placeholder="0"
                    />
                    <span>units</span>
                  </span>
                </label>
              </div>

              <div className="consumption-heading">
                <div className="form-section-label"><span>02</span> PRODUCTION CONSUMPTION</div>
                <span className="consumption-help">Link only existing production batches</span>
              </div>
              {batchError && <p className="batch-load-error" role="alert">{batchError}</p>}
              {!batchError && batchesLoading && (
                <p className="batch-load-state" role="status"><span className="button-spinner" aria-hidden="true" /> Loading production batches…</p>
              )}
              {!batchError && !batchesLoading && productionBatches.length === 0 && (
                <p className="batch-load-error" role="alert">No production batches are available. Close this form and try again later.</p>
              )}
              <div className="consumption-rows">
                {lotForm.consumption.map((row, index) => {
                  const selectedByOtherRow = new Set(
                    lotForm.consumption.filter((_, rowIndex) => rowIndex !== index).map((item) => item.batchId),
                  )
                  return (
                    <div className="consumption-row" key={`consumption-${index}`}>
                      <label className="form-field batch-field">
                        <span>Production batch <i>*</i></span>
                        <select
                          required
                          disabled={batchesLoading || Boolean(batchError) || !productionBatches.length}
                          value={row.batchId}
                          onChange={(event) => updateConsumption(index, 'batchId', event.target.value)}
                        >
                          <option value="">Select a batch</option>
                          {productionBatches.map((batch) => (
                            <option key={batch.batchId} value={batch.batchId} disabled={selectedByOtherRow.has(batch.batchId)}>
                              {batch.batchId} · {formatDate(batch.productionDate)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field used-quantity-field">
                        <span>Quantity used <i>*</i></span>
                        <span className="quantity-input-wrap">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={row.quantityUsed}
                            onChange={(event) => updateConsumption(index, 'quantityUsed', event.target.value)}
                            placeholder="0"
                          />
                          <span>units</span>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="remove-row-button"
                        aria-label={`Remove consumption row ${index + 1}`}
                        disabled={lotForm.consumption.length === 1 || savingLot}
                        onClick={() => removeConsumptionRow(index)}
                      >−</button>
                    </div>
                  )
                })}
              </div>
              <div className="consumption-footer">
                <button type="button" className="add-row-button" disabled={savingLot || !productionBatches.length} onClick={addConsumptionRow}>
                  <span aria-hidden="true">＋</span> Add production batch
                </button>
                <span className="consumption-total">
                  Total used <strong>{formatNumber(lotForm.consumption.reduce((total, row) => total + Number(row.quantityUsed || 0), 0))}</strong> / {formatNumber(lotForm.quantityReceived || 0)} units
                </span>
              </div>

              <div className="defective-status-note">
                <span aria-hidden="true">!</span>
                <p>This record will always be saved with <strong>DEFECTIVE</strong> status.</p>
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <footer className="dialog-actions">
                <button type="button" className="cancel-button" disabled={savingLot} onClick={() => setIsDefectiveModalOpen(false)}>Cancel</button>
                <button
                  type="submit"
                  className="save-defective-button"
                  disabled={savingLot || batchesLoading || Boolean(batchError) || !productionBatches.length}
                >
                  {savingLot && <span className="button-spinner" aria-hidden="true" />}
                  {savingLot ? 'Saving lot…' : 'Save defective lot'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
