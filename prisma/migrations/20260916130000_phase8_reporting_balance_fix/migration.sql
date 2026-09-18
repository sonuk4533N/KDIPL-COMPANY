DROP VIEW IF EXISTS "reporting_stock_balance";
CREATE VIEW "reporting_stock_balance" AS
SELECT st."locationId", st."materialId", st."unitId",
  SUM(CASE
    WHEN st.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN st.quantity
    WHEN st.type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN -st.quantity
    WHEN st.type='REVERSAL' AND original.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN -st.quantity
    WHEN st.type='REVERSAL' THEN st.quantity
    ELSE 0 END)::DECIMAL(18,3) AS quantity
FROM "StockTransaction" st
LEFT JOIN "StockTransaction" original ON original.id=st."reversalOfId"
GROUP BY st."locationId", st."materialId", st."unitId";
