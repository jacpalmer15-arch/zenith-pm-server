


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."file_entity_type" AS ENUM (
    'settings',
    'customer',
    'project',
    'quote'
);


ALTER TYPE "public"."file_entity_type" OWNER TO "postgres";


CREATE TYPE "public"."file_kind" AS ENUM (
    'photo',
    'pdf',
    'logo',
    'other'
);


ALTER TYPE "public"."file_kind" OWNER TO "postgres";


CREATE TYPE "public"."inventory_txn_type" AS ENUM (
    'RECEIPT',
    'ADJUSTMENT',
    'USAGE',
    'RETURN'
);


ALTER TYPE "public"."inventory_txn_type" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'Planning',
    'Quoted',
    'Active',
    'Completed',
    'Closed'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."quote_status" AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED'
);


ALTER TYPE "public"."quote_status" OWNER TO "postgres";


CREATE TYPE "public"."quote_status_new" AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED'
);


ALTER TYPE "public"."quote_status_new" OWNER TO "postgres";


CREATE TYPE "public"."quote_type" AS ENUM (
    'BASE',
    'CHANGE_ORDER'
);


ALTER TYPE "public"."quote_type" OWNER TO "postgres";


CREATE TYPE "public"."work_status" AS ENUM (
    'UNSCHEDULED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CLOSED',
    'CANCELED'
);


ALTER TYPE "public"."work_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_quote"("p_quote_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q public.quotes%rowtype;
  base_total numeric(12,2);
  co_total   numeric(12,2);
begin
  select * into q
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Quote not found';
  end if;

  -- idempotent
  if q.status = 'ACCEPTED' then
    return;
  end if;

  -- One accepted BASE per project (unique index should also protect this)
  if q.quote_type = 'BASE' then
    perform 1
    from public.quotes
    where project_id = q.project_id
      and quote_type = 'BASE'
      and status = 'ACCEPTED';

    if found then
      raise exception 'This project already has an accepted BASE quote.';
    end if;
  end if;

  -- Set accepted status + snapshot tax rate
  update public.quotes
  set status = 'ACCEPTED',
      accepted_at = now(),
      tax_rate_snapshot = (select rate from public.tax_rules where id = q.tax_rule_id)
  where id = p_quote_id;

  -- Recompute project contract rollups from accepted quotes
  select coalesce(sum(total_amount), 0) into base_total
  from public.quotes
  where project_id = q.project_id
    and quote_type = 'BASE'
    and status = 'ACCEPTED';

  select coalesce(sum(total_amount), 0) into co_total
  from public.quotes
  where project_id = q.project_id
    and quote_type = 'CHANGE_ORDER'
    and status = 'ACCEPTED';

  update public.projects
  set base_contract_amount = base_total,
      change_order_amount = co_total,
      contract_amount = base_total + co_total,
      status = 'Active'
  where id = q.project_id;

end $$;


ALTER FUNCTION "public"."accept_quote"("p_quote_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_number"("p_kind" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.settings%rowtype;
  out_no text;
begin
  select * into s from public.settings limit 1 for update;

  if p_kind = 'customer' then
    out_no := s.customer_number_prefix || lpad(s.next_customer_seq::text, 6, '0');
    update public.settings
      set next_customer_seq = next_customer_seq + 1
      where id = s.id;
    return out_no;

  elsif p_kind = 'project' then
    out_no := s.project_number_prefix || lpad(s.next_project_seq::text, 6, '0');
    update public.settings
      set next_project_seq = next_project_seq + 1
      where id = s.id;
    return out_no;

  elsif p_kind = 'quote' then
    out_no := s.quote_number_prefix || lpad(s.next_quote_seq::text, 6, '0');
    update public.settings
      set next_quote_seq = next_quote_seq + 1
      where id = s.id;
    return out_no;

  elsif p_kind = 'work_order' then
    out_no := s.work_order_number_prefix || lpad(s.next_work_order_seq::text, 6, '0');
    update public.settings
      set next_work_order_seq = next_work_order_seq + 1
      where id = s.id;
    return out_no;

  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
end $$;


ALTER FUNCTION "public"."get_next_number"("p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_updates_on_accepted_quotes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st public.quote_status;
begin
  select status into st
  from public.quotes
  where id = coalesce(new.id, old.id);

  if st = 'ACCEPTED' then
    raise exception 'Accepted quotes are locked and cannot be modified.';
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."prevent_updates_on_accepted_quotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st public.quote_status;
begin
  select q.status into st
  from public.quotes q
  where q.id = coalesce(new.quote_id, old.quote_id);

  if st = 'ACCEPTED' then
    raise exception 'Quote lines for an accepted quote are locked and cannot be modified.';
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_employees_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."set_employees_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_equipment_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_equipment_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_equipment_usage_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_equipment_usage_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_job_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_job_queue_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_qbo_connections_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_qbo_connections_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_qbo_entity_map_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_qbo_entity_map_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_receipts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_receipts_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "actor_user_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'System audit log for tracking key business actions';



CREATE TABLE IF NOT EXISTS "public"."cost_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost_type_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cost_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cost_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_no" "text" NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "billing_street" "text",
    "billing_city" "text",
    "billing_state" "text",
    "billing_zip" "text",
    "service_street" "text",
    "service_city" "text",
    "service_state" "text",
    "service_zip" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "qbo_customer_ref" "text",
    "qbo_last_synced_at" timestamp with time zone
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'TECH'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "serial_no" "text",
    "hourly_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "daily_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


COMMENT ON TABLE "public"."equipment" IS 'Equipment inventory with hourly and daily rates for billing';



COMMENT ON COLUMN "public"."equipment"."hourly_rate" IS 'Rate charged per hour of equipment usage';



COMMENT ON COLUMN "public"."equipment"."daily_rate" IS 'Rate charged per day of equipment usage';



CREATE TABLE IF NOT EXISTS "public"."equipment_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone,
    "billed_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "cost_total" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."equipment_usage" OWNER TO "postgres";


COMMENT ON TABLE "public"."equipment_usage" IS 'Equipment usage records linked to work orders';



COMMENT ON COLUMN "public"."equipment_usage"."billed_rate" IS 'The rate applied for this usage (hourly or daily)';



COMMENT ON COLUMN "public"."equipment_usage"."cost_total" IS 'Total cost calculated for this usage entry';



CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "public"."file_entity_type" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "file_kind" "public"."file_kind" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid" NOT NULL,
    "txn_type" "public"."inventory_txn_type" NOT NULL,
    "qty_delta" numeric(12,4) NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "txn_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_cost_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "work_order_id" "uuid",
    "cost_type_id" "uuid" NOT NULL,
    "cost_code_id" "uuid" NOT NULL,
    "part_id" "uuid",
    "txn_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "qty" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "description" "text",
    "receipt_id" "uuid",
    "receipt_line_item_id" "uuid",
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_id" "text",
    "idempotency_key" "text",
    "external_source" "text",
    "external_txn_id" "text",
    "external_line_id" "text",
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "synced_at" timestamp with time zone,
    "sync_error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_cost_entries_amount_chk" CHECK (("amount" = "round"(("qty" * "unit_cost"), 2))),
    CONSTRAINT "job_cost_entries_one_owner_chk" CHECK (((("project_id" IS NOT NULL) AND ("work_order_id" IS NULL)) OR (("project_id" IS NULL) AND ("work_order_id" IS NOT NULL)))),
    CONSTRAINT "job_cost_entries_receipt_link_chk" CHECK ((("receipt_line_item_id" IS NULL) OR (("receipt_line_item_id" IS NOT NULL) AND ("receipt_id" IS NOT NULL))))
);


ALTER TABLE "public"."job_cost_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text",
    "street" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip" "text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."part_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "name" "text" NOT NULL,
    "description_default" "text" DEFAULT ''::"text" NOT NULL,
    "category_id" "uuid",
    "uom" "text" NOT NULL,
    "is_taxable" boolean DEFAULT true NOT NULL,
    "cost_type_id" "uuid",
    "cost_code_id" "uuid",
    "sell_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "avg_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "last_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_no" "text" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."project_status" DEFAULT 'Planning'::"public"."project_status" NOT NULL,
    "job_street" "text",
    "job_city" "text",
    "job_state" "text",
    "job_zip" "text",
    "base_contract_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "change_order_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "contract_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "budget_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "invoiced_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "qbo_job_ref" "text",
    "qbo_last_synced_at" timestamp with time zone
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qbo_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "realm_id" "text" NOT NULL,
    "access_token_enc" "text" NOT NULL,
    "refresh_token_enc" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "scope" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qbo_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qbo_entity_map" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "local_table" "text",
    "local_id" "uuid" NOT NULL,
    "qbo_id" "text" NOT NULL,
    "qbo_sync_token" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qbo_entity_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qbo_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "realm_id" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."qbo_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "line_no" integer DEFAULT 1 NOT NULL,
    "part_id" "uuid",
    "description" "text" NOT NULL,
    "uom" "text" NOT NULL,
    "qty" numeric(12,4) DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_taxable" boolean DEFAULT true NOT NULL,
    "line_subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_tax" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quote_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_no" "text" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "quote_type" "public"."quote_type" DEFAULT 'BASE'::"public"."quote_type" NOT NULL,
    "parent_quote_id" "uuid",
    "status" "public"."quote_status" DEFAULT 'DRAFT'::"public"."quote_status" NOT NULL,
    "quote_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "valid_until" "date",
    "tax_rule_id" "uuid" NOT NULL,
    "tax_rate_snapshot" numeric(9,6),
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "accepted_at" timestamp with time zone,
    "pdf_file_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "work_order_id" "uuid",
    "qbo_estimate_ref" "text",
    "qbo_last_synced_at" timestamp with time zone,
    "qbo_push_status" "text",
    CONSTRAINT "ck_quote_parent" CHECK (((("quote_type" = 'BASE'::"public"."quote_type") AND ("parent_quote_id" IS NULL)) OR (("quote_type" = 'CHANGE_ORDER'::"public"."quote_type") AND ("parent_quote_id" IS NOT NULL)))),
    CONSTRAINT "quotes_one_parent_chk" CHECK (((("project_id" IS NOT NULL) AND ("work_order_id" IS NULL)) OR (("project_id" IS NULL) AND ("work_order_id" IS NOT NULL))))
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "line_no" integer DEFAULT 1 NOT NULL,
    "part_id" "uuid",
    "description" "text" NOT NULL,
    "uom" "text",
    "qty" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipt_line_items_amount_chk" CHECK (("amount" = "round"(("qty" * "unit_cost"), 2)))
);


ALTER TABLE "public"."receipt_line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_name" "text",
    "receipt_date" "date",
    "total_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "storage_path" "text" NOT NULL,
    "notes" "text",
    "is_allocated" boolean DEFAULT false NOT NULL,
    "allocated_to_work_order_id" "uuid",
    "allocated_overhead_bucket" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."receipts" IS 'Vendor receipts and their allocation to work orders or overhead buckets';



COMMENT ON COLUMN "public"."receipts"."storage_path" IS 'Path to the receipt image/document in storage';



COMMENT ON COLUMN "public"."receipts"."is_allocated" IS 'Whether the receipt has been allocated to a work order or overhead bucket';



COMMENT ON COLUMN "public"."receipts"."allocated_overhead_bucket" IS 'Overhead category if not allocated to a specific work order';



CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" DEFAULT ''::"text" NOT NULL,
    "company_phone" "text",
    "company_email" "text",
    "company_address" "text",
    "default_quote_terms" "text" DEFAULT ''::"text" NOT NULL,
    "default_tax_rule_id" "uuid",
    "customer_number_prefix" "text" DEFAULT 'C-'::"text" NOT NULL,
    "next_customer_seq" bigint DEFAULT 1 NOT NULL,
    "project_number_prefix" "text" DEFAULT 'P-'::"text" NOT NULL,
    "next_project_seq" bigint DEFAULT 1 NOT NULL,
    "quote_number_prefix" "text" DEFAULT 'Q-'::"text" NOT NULL,
    "next_quote_seq" bigint DEFAULT 1 NOT NULL,
    "work_order_number_prefix" "text" DEFAULT 'WO-'::"text" NOT NULL,
    "next_work_order_seq" bigint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "default_labor_rate" numeric(12,4) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."settings"."default_labor_rate" IS 'Default labor rate per hour for time entry cost estimation';



CREATE TABLE IF NOT EXISTS "public"."tax_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "rate" numeric(9,6) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "tax_rules_rate_check" CHECK ((("rate" >= (0)::numeric) AND ("rate" <= (1)::numeric)))
);


ALTER TABLE "public"."tax_rules" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_receipt_line_allocation_status" AS
 SELECT "rli"."id" AS "receipt_line_item_id",
    "rli"."receipt_id",
    "rli"."line_no",
    "rli"."description",
    "rli"."part_id",
    "rli"."qty",
    "rli"."unit_cost",
    "rli"."amount" AS "line_total",
    (COALESCE("sum"("jce"."amount"), (0)::numeric))::numeric(10,2) AS "allocated_total",
    (("rli"."amount" - COALESCE("sum"("jce"."amount"), (0)::numeric)))::numeric(10,2) AS "unallocated_total",
        CASE
            WHEN (COALESCE("sum"("jce"."amount"), (0)::numeric) = (0)::numeric) THEN 'UNALLOCATED'::"text"
            WHEN (COALESCE("sum"("jce"."amount"), (0)::numeric) = "rli"."amount") THEN 'ALLOCATED'::"text"
            WHEN (COALESCE("sum"("jce"."amount"), (0)::numeric) < "rli"."amount") THEN 'PARTIAL'::"text"
            ELSE 'OVERALLOCATED'::"text"
        END AS "allocation_status"
   FROM ("public"."receipt_line_items" "rli"
     LEFT JOIN "public"."job_cost_entries" "jce" ON (("jce"."receipt_line_item_id" = "rli"."id")))
  GROUP BY "rli"."id", "rli"."receipt_id", "rli"."line_no", "rli"."description", "rli"."part_id", "rli"."qty", "rli"."unit_cost", "rli"."amount";


ALTER VIEW "public"."vw_receipt_line_allocation_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_receipt_allocation_status" AS
 WITH "line_status" AS (
         SELECT "vw_receipt_line_allocation_status"."receipt_line_item_id",
            "vw_receipt_line_allocation_status"."receipt_id",
            "vw_receipt_line_allocation_status"."line_no",
            "vw_receipt_line_allocation_status"."description",
            "vw_receipt_line_allocation_status"."part_id",
            "vw_receipt_line_allocation_status"."qty",
            "vw_receipt_line_allocation_status"."unit_cost",
            "vw_receipt_line_allocation_status"."line_total",
            "vw_receipt_line_allocation_status"."allocated_total",
            "vw_receipt_line_allocation_status"."unallocated_total",
            "vw_receipt_line_allocation_status"."allocation_status"
           FROM "public"."vw_receipt_line_allocation_status"
        )
 SELECT "r"."id" AS "receipt_id",
    "r"."vendor_name",
    "r"."receipt_date",
    "r"."total_amount" AS "receipt_header_total",
    "r"."storage_path",
    "r"."is_allocated" AS "stored_is_allocated",
    (COALESCE("sum"("ls"."line_total"), (0)::numeric))::numeric(10,2) AS "receipt_lines_total",
    (COALESCE("sum"("ls"."allocated_total"), (0)::numeric))::numeric(10,2) AS "receipt_allocated_total",
    (COALESCE("sum"("ls"."unallocated_total"), (0)::numeric))::numeric(10,2) AS "receipt_unallocated_total",
        CASE
            WHEN ("count"("ls"."receipt_line_item_id") = 0) THEN 'NO_LINES'::"text"
            WHEN "bool_or"(("ls"."allocation_status" = 'OVERALLOCATED'::"text")) THEN 'OVERALLOCATED'::"text"
            WHEN "bool_and"(("ls"."allocation_status" = 'ALLOCATED'::"text")) THEN 'ALLOCATED'::"text"
            WHEN "bool_and"(("ls"."allocation_status" = 'UNALLOCATED'::"text")) THEN 'UNALLOCATED'::"text"
            ELSE 'PARTIAL'::"text"
        END AS "allocation_status",
        CASE
            WHEN ("count"("ls"."receipt_line_item_id") = 0) THEN true
            WHEN "bool_and"(("ls"."allocation_status" = 'ALLOCATED'::"text")) THEN false
            ELSE true
        END AS "needs_allocation"
   FROM ("public"."receipts" "r"
     LEFT JOIN "line_status" "ls" ON (("ls"."receipt_id" = "r"."id")))
  GROUP BY "r"."id", "r"."vendor_name", "r"."receipt_date", "r"."total_amount", "r"."storage_path", "r"."is_allocated";


ALTER VIEW "public"."vw_receipt_allocation_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "tech_user_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_order_schedule_check" CHECK (("end_at" > "start_at"))
);


ALTER TABLE "public"."work_order_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "tech_user_id" "uuid" NOT NULL,
    "clock_in_at" timestamp with time zone NOT NULL,
    "clock_out_at" timestamp with time zone,
    "break_minutes" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_order_time_entries_check" CHECK ((("clock_out_at" IS NULL) OR ("clock_out_at" > "clock_in_at")))
);


ALTER TABLE "public"."work_order_time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "work_order_no" "text",
    "status" "public"."work_status" DEFAULT 'UNSCHEDULED'::"public"."work_status" NOT NULL,
    "priority" integer DEFAULT 3 NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "requested_window_start" timestamp with time zone,
    "requested_window_end" timestamp with time zone,
    "assigned_to" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contract_subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "contract_tax" numeric(12,2) DEFAULT 0 NOT NULL,
    "contract_total" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_codes"
    ADD CONSTRAINT "cost_codes_code_cost_type_id_key" UNIQUE ("code", "cost_type_id");



ALTER TABLE ONLY "public"."cost_codes"
    ADD CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_types"
    ADD CONSTRAINT "cost_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."cost_types"
    ADD CONSTRAINT "cost_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_customer_no_key" UNIQUE ("customer_no");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_usage"
    ADD CONSTRAINT "equipment_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "job_cost_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_categories"
    ADD CONSTRAINT "part_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."part_categories"
    ADD CONSTRAINT "part_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_no_key" UNIQUE ("project_no");



ALTER TABLE ONLY "public"."qbo_connections"
    ADD CONSTRAINT "qbo_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qbo_connections"
    ADD CONSTRAINT "qbo_connections_realm_id_key" UNIQUE ("realm_id");



ALTER TABLE ONLY "public"."qbo_entity_map"
    ADD CONSTRAINT "qbo_entity_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qbo_webhook_events"
    ADD CONSTRAINT "qbo_webhook_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."qbo_webhook_events"
    ADD CONSTRAINT "qbo_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_quote_no_key" UNIQUE ("quote_no");



ALTER TABLE ONLY "public"."receipt_line_items"
    ADD CONSTRAINT "receipt_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rules"
    ADD CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qbo_entity_map"
    ADD CONSTRAINT "uq_qbo_entity_map_local" UNIQUE ("entity_type", "local_id");



ALTER TABLE ONLY "public"."qbo_entity_map"
    ADD CONSTRAINT "uq_qbo_entity_map_qbo" UNIQUE ("entity_type", "qbo_id");



ALTER TABLE ONLY "public"."work_order_schedule"
    ADD CONSTRAINT "work_order_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_time_entries"
    ADD CONSTRAINT "work_order_time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_user_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_customers_name" ON "public"."customers" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));



CREATE INDEX "idx_equipment_is_active" ON "public"."equipment" USING "btree" ("is_active");



CREATE INDEX "idx_equipment_name" ON "public"."equipment" USING "btree" ("name");



CREATE INDEX "idx_equipment_usage_equipment" ON "public"."equipment_usage" USING "btree" ("equipment_id");



CREATE INDEX "idx_equipment_usage_start_at" ON "public"."equipment_usage" USING "btree" ("start_at");



CREATE INDEX "idx_equipment_usage_work_order" ON "public"."equipment_usage" USING "btree" ("work_order_id");



CREATE INDEX "idx_files_entity" ON "public"."files" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_inventory_ledger_date" ON "public"."inventory_ledger" USING "btree" ("txn_date");



CREATE INDEX "idx_inventory_ledger_part" ON "public"."inventory_ledger" USING "btree" ("part_id");



CREATE INDEX "idx_job_queue_locked" ON "public"."job_queue" USING "btree" ("status", "locked_at") WHERE ("status" = 'PROCESSING'::"text");



CREATE INDEX "idx_job_queue_ready" ON "public"."job_queue" USING "btree" ("status", "run_after") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_locations_customer" ON "public"."locations" USING "btree" ("customer_id");



CREATE INDEX "idx_parts_category" ON "public"."parts" USING "btree" ("category_id");



CREATE INDEX "idx_parts_name" ON "public"."parts" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));



CREATE INDEX "idx_projects_customer" ON "public"."projects" USING "btree" ("customer_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_qbo_connections_realm" ON "public"."qbo_connections" USING "btree" ("realm_id");



CREATE INDEX "idx_qbo_entity_map_local" ON "public"."qbo_entity_map" USING "btree" ("entity_type", "local_id");



CREATE INDEX "idx_qbo_entity_map_qbo" ON "public"."qbo_entity_map" USING "btree" ("entity_type", "qbo_id");



CREATE INDEX "idx_qbo_webhook_events_status" ON "public"."qbo_webhook_events" USING "btree" ("status", "received_at");



CREATE INDEX "idx_quote_lines_quote" ON "public"."quote_lines" USING "btree" ("quote_id");



CREATE INDEX "idx_quotes_project" ON "public"."quotes" USING "btree" ("project_id");



CREATE INDEX "idx_quotes_status" ON "public"."quotes" USING "btree" ("status");



CREATE INDEX "idx_quotes_work_order" ON "public"."quotes" USING "btree" ("work_order_id");



CREATE INDEX "idx_receipts_created_at" ON "public"."receipts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_receipts_is_allocated" ON "public"."receipts" USING "btree" ("is_allocated");



CREATE INDEX "idx_receipts_receipt_date" ON "public"."receipts" USING "btree" ("receipt_date");



CREATE INDEX "idx_receipts_work_order" ON "public"."receipts" USING "btree" ("allocated_to_work_order_id");



CREATE INDEX "idx_schedule_tech_start" ON "public"."work_order_schedule" USING "btree" ("tech_user_id", "start_at");



CREATE INDEX "idx_time_entries_work_order" ON "public"."work_order_time_entries" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_orders_customer" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_location" ON "public"."work_orders" USING "btree" ("location_id");



CREATE INDEX "idx_work_orders_status" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "ix_job_cost_entries_cost_dims" ON "public"."job_cost_entries" USING "btree" ("cost_type_id", "cost_code_id");



CREATE INDEX "ix_job_cost_entries_part" ON "public"."job_cost_entries" USING "btree" ("part_id");



CREATE INDEX "ix_job_cost_entries_project_date" ON "public"."job_cost_entries" USING "btree" ("project_id", "txn_date");



CREATE INDEX "ix_job_cost_entries_receipt_line_item_id" ON "public"."job_cost_entries" USING "btree" ("receipt_line_item_id");



CREATE INDEX "ix_job_cost_entries_source" ON "public"."job_cost_entries" USING "btree" ("source_type", "source_id");



CREATE INDEX "ix_job_cost_entries_sync" ON "public"."job_cost_entries" USING "btree" ("sync_status", "synced_at");



CREATE INDEX "ix_job_cost_entries_work_order_date" ON "public"."job_cost_entries" USING "btree" ("work_order_id", "txn_date");



CREATE INDEX "ix_receipt_line_items_part_id" ON "public"."receipt_line_items" USING "btree" ("part_id");



CREATE INDEX "ix_receipt_line_items_receipt_id" ON "public"."receipt_line_items" USING "btree" ("receipt_id");



CREATE UNIQUE INDEX "uq_quotes_one_accepted_base_per_project" ON "public"."quotes" USING "btree" ("project_id") WHERE (("status" = 'ACCEPTED'::"public"."quote_status") AND ("quote_type" = 'BASE'::"public"."quote_type"));



CREATE UNIQUE INDEX "ux_job_cost_entries_idempotency_key" ON "public"."job_cost_entries" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "ux_receipt_line_items_receipt_line_no" ON "public"."receipt_line_items" USING "btree" ("receipt_id", "line_no");



CREATE OR REPLACE TRIGGER "equipment_updated_at_trigger" BEFORE UPDATE ON "public"."equipment" FOR EACH ROW EXECUTE FUNCTION "public"."update_equipment_updated_at"();



CREATE OR REPLACE TRIGGER "equipment_usage_updated_at_trigger" BEFORE UPDATE ON "public"."equipment_usage" FOR EACH ROW EXECUTE FUNCTION "public"."update_equipment_usage_updated_at"();



CREATE OR REPLACE TRIGGER "receipts_updated_at_trigger" BEFORE UPDATE ON "public"."receipts" FOR EACH ROW EXECUTE FUNCTION "public"."update_receipts_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cost_codes_updated_at" BEFORE UPDATE ON "public"."cost_codes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cost_types_updated_at" BEFORE UPDATE ON "public"."cost_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_employees_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_employees_updated_at"();



CREATE OR REPLACE TRIGGER "trg_job_cost_entries_updated_at" BEFORE UPDATE ON "public"."job_cost_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_job_queue_updated_at" BEFORE UPDATE ON "public"."job_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_job_queue_updated_at"();



CREATE OR REPLACE TRIGGER "trg_part_categories_updated_at" BEFORE UPDATE ON "public"."part_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_parts_updated_at" BEFORE UPDATE ON "public"."parts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_qbo_connections_updated_at" BEFORE UPDATE ON "public"."qbo_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_qbo_connections_updated_at"();



CREATE OR REPLACE TRIGGER "trg_qbo_entity_map_updated_at" BEFORE UPDATE ON "public"."qbo_entity_map" FOR EACH ROW EXECUTE FUNCTION "public"."update_qbo_entity_map_updated_at"();



CREATE OR REPLACE TRIGGER "trg_quote_lines_lock" BEFORE DELETE OR UPDATE ON "public"."quote_lines" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"();



CREATE OR REPLACE TRIGGER "trg_quote_lines_updated_at" BEFORE UPDATE ON "public"."quote_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_quotes_lock" BEFORE DELETE OR UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_updates_on_accepted_quotes"();



CREATE OR REPLACE TRIGGER "trg_quotes_updated_at" BEFORE UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_receipt_line_items_updated_at" BEFORE UPDATE ON "public"."receipt_line_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_settings_updated_at" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tax_rules_updated_at" BEFORE UPDATE ON "public"."tax_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cost_codes"
    ADD CONSTRAINT "cost_codes_cost_type_id_fkey" FOREIGN KEY ("cost_type_id") REFERENCES "public"."cost_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."equipment_usage"
    ADD CONSTRAINT "equipment_usage_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."equipment_usage"
    ADD CONSTRAINT "equipment_usage_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_cost_code" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id");



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_cost_type" FOREIGN KEY ("cost_type_id") REFERENCES "public"."cost_types"("id");



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_part" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_project" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_receipt" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_receipt_line" FOREIGN KEY ("receipt_line_item_id") REFERENCES "public"."receipt_line_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_cost_entries"
    ADD CONSTRAINT "fk_job_cost_entries_work_order" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipt_line_items"
    ADD CONSTRAINT "fk_receipt_line_items_part" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipt_line_items"
    ADD CONSTRAINT "fk_receipt_line_items_receipt" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."part_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_cost_type_id_fkey" FOREIGN KEY ("cost_type_id") REFERENCES "public"."cost_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_parent_quote_id_fkey" FOREIGN KEY ("parent_quote_id") REFERENCES "public"."quotes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_tax_rule_id_fkey" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rules"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_allocated_to_work_order_id_fkey" FOREIGN KEY ("allocated_to_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_order_schedule"
    ADD CONSTRAINT "work_order_schedule_tech_user_id_fkey" FOREIGN KEY ("tech_user_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."work_order_schedule"
    ADD CONSTRAINT "work_order_schedule_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_time_entries"
    ADD CONSTRAINT "work_order_time_entries_tech_user_id_fkey" FOREIGN KEY ("tech_user_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."work_order_time_entries"
    ADD CONSTRAINT "work_order_time_entries_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



CREATE POLICY "Allow authenticated users to delete equipment" ON "public"."equipment" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete equipment_usage" ON "public"."equipment_usage" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete receipts" ON "public"."receipts" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert equipment" ON "public"."equipment" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert equipment_usage" ON "public"."equipment_usage" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert receipts" ON "public"."receipts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update equipment" ON "public"."equipment" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update equipment_usage" ON "public"."equipment_usage" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update receipts" ON "public"."receipts" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view equipment" ON "public"."equipment" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view equipment_usage" ON "public"."equipment_usage" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_read_write_cost_codes" ON "public"."cost_codes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_cost_types" ON "public"."cost_types" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_customers" ON "public"."customers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_files" ON "public"."files" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_inventory_ledger" ON "public"."inventory_ledger" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_job_cost_entries" ON "public"."job_cost_entries" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_part_categories" ON "public"."part_categories" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_parts" ON "public"."parts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_projects" ON "public"."projects" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_quote_lines" ON "public"."quote_lines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_quotes" ON "public"."quotes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_receipt_line_items" ON "public"."receipt_line_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_settings" ON "public"."settings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_write_tax_rules" ON "public"."tax_rules" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cost_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cost_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_cost_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qbo_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qbo_entity_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qbo_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tax_rules" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_quote"("p_quote_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_quote"("p_quote_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_quote"("p_quote_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_number"("p_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_number"("p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_number"("p_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_updates_on_accepted_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_updates_on_accepted_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_updates_on_accepted_quotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_updates_on_lines_of_accepted_quotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_employees_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_employees_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_employees_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_equipment_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_equipment_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_equipment_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_equipment_usage_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_equipment_usage_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_equipment_usage_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_job_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_job_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_job_queue_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_qbo_connections_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_qbo_connections_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_qbo_connections_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_qbo_entity_map_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_qbo_entity_map_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_qbo_entity_map_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_receipts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_receipts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_receipts_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cost_codes" TO "anon";
GRANT ALL ON TABLE "public"."cost_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_codes" TO "service_role";



GRANT ALL ON TABLE "public"."cost_types" TO "anon";
GRANT ALL ON TABLE "public"."cost_types" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_types" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_usage" TO "anon";
GRANT ALL ON TABLE "public"."equipment_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_usage" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_ledger" TO "anon";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."job_cost_entries" TO "anon";
GRANT ALL ON TABLE "public"."job_cost_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."job_cost_entries" TO "service_role";



GRANT ALL ON TABLE "public"."job_queue" TO "anon";
GRANT ALL ON TABLE "public"."job_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."job_queue" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."part_categories" TO "anon";
GRANT ALL ON TABLE "public"."part_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."part_categories" TO "service_role";



GRANT ALL ON TABLE "public"."parts" TO "anon";
GRANT ALL ON TABLE "public"."parts" TO "authenticated";
GRANT ALL ON TABLE "public"."parts" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_connections" TO "anon";
GRANT ALL ON TABLE "public"."qbo_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_connections" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_entity_map" TO "anon";
GRANT ALL ON TABLE "public"."qbo_entity_map" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_entity_map" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."qbo_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."quote_lines" TO "anon";
GRANT ALL ON TABLE "public"."quote_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_lines" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_line_items" TO "anon";
GRANT ALL ON TABLE "public"."receipt_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."tax_rules" TO "anon";
GRANT ALL ON TABLE "public"."tax_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_rules" TO "service_role";



GRANT ALL ON TABLE "public"."vw_receipt_line_allocation_status" TO "anon";
GRANT ALL ON TABLE "public"."vw_receipt_line_allocation_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_receipt_line_allocation_status" TO "service_role";



GRANT ALL ON TABLE "public"."vw_receipt_allocation_status" TO "anon";
GRANT ALL ON TABLE "public"."vw_receipt_allocation_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_receipt_allocation_status" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_schedule" TO "anon";
GRANT ALL ON TABLE "public"."work_order_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_time_entries" TO "anon";
GRANT ALL ON TABLE "public"."work_order_time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







