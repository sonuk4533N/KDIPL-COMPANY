INSERT INTO "RolePermission" ("roleId","permissionId","grantedAt")
SELECT r.id,p.id,CURRENT_TIMESTAMP FROM "Role" r JOIN "Permission" p ON p.code='inventory.view'
WHERE r.code IN ('PROJECT_DIRECTOR','PROJECT_MANAGER','MANAGING_DIRECTOR','ACCOUNTS') ON CONFLICT DO NOTHING;

CREATE FUNCTION "kdipl_customer_transition_audit"() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "AuditLog" (id,"actorUserId",action,"entityType","entityId","before","after",reason)
  VALUES (gen_random_uuid(),NEW."updatedById",CASE WHEN TG_OP='INSERT' THEN 'CREATE'::"AuditAction" ELSE 'UPDATE'::"AuditAction" END,
    'CustomerStockMovementDatabase',NEW.id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),NEW."transitionReason");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerMovement_audit" AFTER INSERT OR UPDATE ON "CustomerStockMovement" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_transition_audit"();

CREATE FUNCTION "kdipl_customer_negative_audit"() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "AuditLog" (id,"actorUserId",action,"entityType","entityId","before","after",reason)
  VALUES (gen_random_uuid(),NEW."createdById",CASE WHEN TG_OP='INSERT' THEN 'CREATE'::"AuditAction" ELSE 'UPDATE'::"AuditAction" END,
    'TemporaryNegativeStockException',NEW.id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),NEW.reason);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerNegative_audit" AFTER INSERT OR UPDATE ON "TemporaryNegativeStockException" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_negative_audit"();
