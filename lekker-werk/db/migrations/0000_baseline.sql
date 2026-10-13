-- uuidv7() is built into PostgreSQL 18. On older servers, install an equivalent so the
-- table defaults below work everywhere. (On 18 the built-in in pg_catalog takes precedence.)
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid
      LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE
        v bytea;
      BEGIN
        -- 48-bit unix ms timestamp + 74 random bits, version 7, RFC 9562 variant.
        v := decode(lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0'), 'hex')
             || substring(uuid_send(gen_random_uuid()) FROM 7 FOR 10);
        v := set_byte(v, 6, (get_byte(v, 6) & 15) | 112);
        v := set_byte(v, 8, (get_byte(v, 8) & 63) | 128);
        RETURN encode(v, 'hex')::uuid;
      END
      $body$
    $fn$;
  END IF;
END
$$;--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE', 'ON_LEAVE', 'PUBLIC_HOLIDAY', 'SITE_CLOSED');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('TELEGRAM', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."clock_event_type" AS ENUM('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');--> statement-breakpoint
CREATE TYPE "public"."clock_source" AS ENUM('TELEGRAM', 'WHATSAPP', 'WEB', 'MANUAL_CORRECTION', 'IMPORT', 'DEVICE');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('RFID_CARD', 'NFC_TAG', 'PIN', 'BIOMETRIC_ID', 'BARCODE');--> statement-breakpoint
CREATE TYPE "public"."device_kind" AS ENUM('RFID_READER', 'NFC_READER', 'BIOMETRIC', 'KIOSK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."integration_category" AS ENUM('ERP', 'ACCOUNTING', 'PAYROLL', 'HR');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('CUSTOM_API', 'SYSPRO', 'ODOO', 'SAGE', 'XERO', 'QUICKBOOKS', 'SIMPLEPAY', 'PAYSPACE');--> statement-breakpoint
CREATE TYPE "public"."integration_request_status" AS ENUM('SUBMITTED', 'REVIEWING', 'QUOTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."leave_accrual" AS ENUM('NONE', 'MONTHLY', 'CYCLE_UPFRONT');--> statement-breakpoint
CREATE TYPE "public"."leave_ledger_kind" AS ENUM('OPENING', 'ACCRUAL', 'USAGE', 'REVERSAL', 'ADJUSTMENT', 'EXPIRY');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('REQUESTED', 'APPROVED', 'DECLINED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."leave_source" AS ENUM('WEB', 'TELEGRAM', 'WHATSAPP', 'MANAGER', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('FORGOT_CLOCK_OUT', 'LATE', 'ABSENT', 'EXCESSIVE_OVERTIME', 'INTEGRATION_FAILED', 'SYNC_COMPLETED', 'QR_DISABLED', 'UNUSUAL_CLOCKING', 'PAYMENT_FAILED', 'TRIAL_ENDING', 'INTEGRATION_REQUESTED', 'LEAVE_REQUESTED', 'LEAVE_DECIDED');--> statement-breakpoint
CREATE TYPE "public"."pay_period_status" AS ENUM('OPEN', 'LOCKED', 'EXPORTED');--> statement-breakpoint
CREATE TYPE "public"."pay_type" AS ENUM('HOURLY', 'SALARIED');--> statement-breakpoint
CREATE TYPE "public"."qr_type" AS ENUM('GENERAL', 'CLOCK_IN', 'CLOCK_OUT', 'TEMPORARY');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('EMPLOYEE_INACTIVE', 'ACCOUNT_NOT_LINKED', 'WRONG_COMPANY', 'QR_INVALID', 'QR_DISABLED', 'QR_EXPIRED', 'NOT_ALLOWED_AT_LOCATION', 'GPS_REQUIRED', 'OUTSIDE_RADIUS', 'ALREADY_CLOCKED_IN', 'NOT_CLOCKED_IN', 'ALREADY_ON_BREAK', 'NOT_ON_BREAK', 'DUPLICATE', 'CLOCKING_NOT_ALLOWED', 'RATE_LIMITED', 'SUBSCRIPTION_INACTIVE', 'CREDENTIAL_UNKNOWN', 'DEVICE_DISABLED', 'TIMESTAMP_OUT_OF_RANGE', 'PERIOD_LOCKED');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'COMPLETE', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('STARTER', 'GROWTH', 'BUSINESS');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"registration_number" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"preferred_channel" "channel_type" NOT NULL,
	"has_multiple_locations" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'Africa/Johannesburg' NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text DEFAULT 'Africa/Johannesburg' NOT NULL,
	"gps_validation_enabled" boolean,
	"allowed_radius_meters" integer,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid,
	"email" text NOT NULL,
	"username" text,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_locations" (
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_locations_employee_id_location_id_pk" PRIMARY KEY("employee_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid,
	"manager_id" uuid,
	"employee_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"department" text,
	"position" text,
	"preferred_channel" "channel_type",
	"platform_identifier" text,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"hired_on" date,
	"deactivated_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_locations" (
	"manager_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_locations_manager_id_location_id_pk" PRIMARY KEY("manager_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clock_devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"kind" "device_kind" NOT NULL,
	"name" text NOT NULL,
	"serial_number" text,
	"key_hash" text NOT NULL,
	"key_hint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"fixed_action" "clock_event_type",
	"last_seen_at" timestamp with time zone,
	"last_ip" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_credentials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "credential_kind" NOT NULL,
	"value_hash" text NOT NULL,
	"value_hint" text DEFAULT '' NOT NULL,
	"label" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"public_handle" text,
	"encrypted_credentials" text,
	"webhook_secret" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_states" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"external_id" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"first_clock_in" timestamp with time zone,
	"last_clock_out" timestamp with time zone,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"auto_break_minutes" integer DEFAULT 0 NOT NULL,
	"scheduled_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_departure_minutes" integer DEFAULT 0 NOT NULL,
	"leave_minutes" integer DEFAULT 0 NOT NULL,
	"leave_type_id" uuid,
	"public_holiday" boolean DEFAULT false NOT NULL,
	"closure_minutes" integer DEFAULT 0 NOT NULL,
	"closure_paid" boolean DEFAULT false NOT NULL,
	"status" "attendance_status" DEFAULT 'PRESENT' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"attendance_record_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"start_event_id" uuid,
	"end_event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "clock_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid,
	"employee_id" uuid,
	"location_id" uuid,
	"qr_code_id" uuid,
	"device_id" uuid,
	"credential_id" uuid,
	"requested_action" "clock_event_type" NOT NULL,
	"source" "clock_source" NOT NULL,
	"status" "validation_status" NOT NULL,
	"rejection_reason" "rejection_reason",
	"clock_event_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"external_id" text,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clock_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_type" "clock_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "clock_source" NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"distance_meters" double precision,
	"qr_code_id" uuid,
	"communication_account_id" uuid,
	"device_id" uuid,
	"credential_id" uuid,
	"corrects_event_id" uuid,
	"corrected_by" uuid,
	"note" text,
	"validation_status" "validation_status" DEFAULT 'ACCEPTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_schedules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL,
	"starts_at" time
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"label" text NOT NULL,
	"type" "qr_type" DEFAULT 'GENERAL' NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_hint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"regenerated_from_id" uuid,
	"created_by" uuid,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overtime_after_minutes_per_day" integer,
	"grace_minutes" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"employee_id" uuid,
	"external_employee_ref" text NOT NULL,
	"work_date" date NOT NULL,
	"hours" numeric(8, 2) NOT NULL,
	"external_record_id" text NOT NULL,
	"raw" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"requested_by" uuid,
	"system_name" text NOT NULL,
	"category" "integration_category" NOT NULL,
	"website" text,
	"contact_email" text NOT NULL,
	"notes" text,
	"data_needed" text,
	"status" "integration_request_status" DEFAULT 'SUBMITTED' NOT NULL,
	"quoted_amount" numeric(10, 2),
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_syncs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"status" "sync_status" DEFAULT 'QUEUED' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"records_imported" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"category" "integration_category" NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_credentials" text,
	"sync_frequency_minutes" integer DEFAULT 60 NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_failed_sync_at" timestamp with time zone,
	"last_error" text,
	"next_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_data_registry" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_data_permissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"role_override" "user_role",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"m_payment_id" text NOT NULL,
	"pf_payment_id" text,
	"plan" "plan_tier" NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"whatsapp_addon" boolean DEFAULT false NOT NULL,
	"amount_gross" numeric(10, 2) NOT NULL,
	"amount_fee" numeric(10, 2),
	"amount_net" numeric(10, 2),
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp with time zone,
	"itn" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'TRIALING' NOT NULL,
	"plan" "plan_tier",
	"interval" "billing_interval",
	"whatsapp_addon" boolean DEFAULT false NOT NULL,
	"trial_started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"payfast_token" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"pay_type" "pay_type" DEFAULT 'HOURLY' NOT NULL,
	"contracted_minutes_per_week" integer NOT NULL,
	"days_per_week" integer NOT NULL,
	"overtime_eligible" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_ledger" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"kind" "leave_ledger_kind" NOT NULL,
	"days" numeric(7, 2) NOT NULL,
	"leave_request_id" uuid,
	"idempotency_key" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"day_fraction" numeric(3, 2) DEFAULT '1' NOT NULL,
	"days" numeric(6, 2) NOT NULL,
	"status" "leave_request_status" DEFAULT 'REQUESTED' NOT NULL,
	"source" "leave_source" NOT NULL,
	"reason" text,
	"document_ref" text,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"paid" boolean NOT NULL,
	"accrual" "leave_accrual" DEFAULT 'NONE' NOT NULL,
	"entitlement_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"cycle_months" integer DEFAULT 12 NOT NULL,
	"document_after_days" integer,
	"employee_requestable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"target" text NOT NULL,
	"integration_id" uuid,
	"row_count" integer NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_period_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"pay_code" text NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"days" numeric(6, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "pay_period_status" DEFAULT 'OPEN' NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp with time zone,
	"lock_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_closures" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"paid" boolean NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_locations" ADD CONSTRAINT "manager_locations_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_locations" ADD CONSTRAINT "manager_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_locations" ADD CONSTRAINT "manager_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_devices" ADD CONSTRAINT "clock_devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_devices" ADD CONSTRAINT "clock_devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_devices" ADD CONSTRAINT "clock_devices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_accounts" ADD CONSTRAINT "communication_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_accounts" ADD CONSTRAINT "communication_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_start_event_id_clock_events_id_fk" FOREIGN KEY ("start_event_id") REFERENCES "public"."clock_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_end_event_id_clock_events_id_fk" FOREIGN KEY ("end_event_id") REFERENCES "public"."clock_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_device_id_clock_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."clock_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_credential_id_employee_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."employee_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_attempts" ADD CONSTRAINT "clock_attempts_clock_event_id_clock_events_id_fk" FOREIGN KEY ("clock_event_id") REFERENCES "public"."clock_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_communication_account_id_communication_accounts_id_fk" FOREIGN KEY ("communication_account_id") REFERENCES "public"."communication_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_device_id_clock_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."clock_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_credential_id_employee_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."employee_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_events" ADD CONSTRAINT "clock_events_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_hours" ADD CONSTRAINT "imported_hours_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_hours" ADD CONSTRAINT "imported_hours_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_hours" ADD CONSTRAINT "imported_hours_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_requests" ADD CONSTRAINT "integration_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_requests" ADD CONSTRAINT "integration_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_syncs" ADD CONSTRAINT "integration_syncs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_syncs" ADD CONSTRAINT "integration_syncs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_data_registry" ADD CONSTRAINT "demo_data_registry_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_data_permissions" ADD CONSTRAINT "employee_data_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_exports" ADD CONSTRAINT "pay_exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_exports" ADD CONSTRAINT "pay_exports_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_exports" ADD CONSTRAINT "pay_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_closures" ADD CONSTRAINT "site_closures_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_closures" ADD CONSTRAINT "site_closures_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_closures" ADD CONSTRAINT "site_closures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_company_idx" ON "locations" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_company_name_uq" ON "locations" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_company_role_idx" ON "users" USING btree ("company_id","role");--> statement-breakpoint
CREATE INDEX "employee_locations_location_idx" ON "employee_locations" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_company_number_uq" ON "employees" USING btree ("company_id","employee_number");--> statement-breakpoint
CREATE INDEX "employees_company_location_idx" ON "employees" USING btree ("company_id","location_id","status");--> statement-breakpoint
CREATE INDEX "employees_company_name_idx" ON "employees" USING btree ("company_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "manager_locations_location_idx" ON "manager_locations" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managers_user_uq" ON "managers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clock_devices_key_uq" ON "clock_devices" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "clock_devices_company_location_idx" ON "clock_devices" USING btree ("company_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_credentials_live_uq" ON "employee_credentials" USING btree ("company_id","kind","value_hash") WHERE "employee_credentials"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "employee_credentials_employee_idx" ON "employee_credentials" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_accounts_identity_uq" ON "communication_accounts" USING btree ("company_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "communication_accounts_employee_idx" ON "communication_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_channels_company_channel_uq" ON "communication_channels" USING btree ("company_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_channels_secret_uq" ON "communication_channels" USING btree ("webhook_secret");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_states_identity_uq" ON "conversation_states" USING btree ("company_id","channel","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_codes_hash_uq" ON "link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_day_uq" ON "attendance_records" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_company_day_idx" ON "attendance_records" USING btree ("company_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_location_day_idx" ON "attendance_records" USING btree ("location_id","work_date");--> statement-breakpoint
CREATE INDEX "break_records_employee_idx" ON "break_records" USING btree ("employee_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "break_records_attendance_idx" ON "break_records" USING btree ("attendance_record_id");--> statement-breakpoint
CREATE INDEX "clock_attempts_company_time_idx" ON "clock_attempts" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clock_attempts_employee_time_idx" ON "clock_attempts" USING btree ("employee_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clock_attempts_idem_idx" ON "clock_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "clock_events_company_time_idx" ON "clock_events" USING btree ("company_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clock_events_employee_time_idx" ON "clock_events" USING btree ("employee_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clock_events_location_time_idx" ON "clock_events" USING btree ("location_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clock_events_device_time_idx" ON "clock_events" USING btree ("device_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "employee_schedules_employee_idx" ON "employee_schedules" USING btree ("employee_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "public_holidays_date_idx" ON "public_holidays" USING btree ("company_id","holiday_date");--> statement-breakpoint
CREATE UNIQUE INDEX "public_holidays_company_date_uq" ON "public_holidays" USING btree (coalesce("company_id", '00000000-0000-0000-0000-000000000000'::uuid),"holiday_date");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_codes_token_uq" ON "qr_codes" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "qr_codes_company_location_idx" ON "qr_codes" USING btree ("company_id","location_id","enabled");--> statement-breakpoint
CREATE INDEX "work_schedules_company_idx" ON "work_schedules" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_hours_external_uq" ON "imported_hours" USING btree ("integration_id","external_record_id");--> statement-breakpoint
CREATE INDEX "imported_hours_company_day_idx" ON "imported_hours" USING btree ("company_id","work_date");--> statement-breakpoint
CREATE INDEX "imported_hours_employee_day_idx" ON "imported_hours" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "integration_requests_company_idx" ON "integration_requests" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "integration_requests_status_idx" ON "integration_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "integration_syncs_integration_idx" ON "integration_syncs" USING btree ("integration_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "integration_syncs_queue_idx" ON "integration_syncs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "integrations_company_idx" ON "integrations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "integrations_due_idx" ON "integrations" USING btree ("enabled","next_sync_at");--> statement-breakpoint
CREATE INDEX "audit_logs_company_time_idx" ON "audit_logs" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_settings_company_uq" ON "company_settings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_data_registry_uq" ON "demo_data_registry" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_data_permissions_uq" ON "employee_data_permissions" USING btree ("company_id","permission_key","role_override");--> statement-breakpoint
CREATE INDEX "notifications_company_idx" ON "notifications" USING btree ("company_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_window_uq" ON "rate_limits" USING btree ("key","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_m_payment_uq" ON "payments" USING btree ("m_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_pf_payment_uq" ON "payments" USING btree ("pf_payment_id");--> statement-breakpoint
CREATE INDEX "payments_company_idx" ON "payments" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_uq" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status","trial_ends_at");--> statement-breakpoint
CREATE INDEX "employment_terms_employee_idx" ON "employment_terms" USING btree ("employee_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leave_ledger_balance_idx" ON "leave_ledger" USING btree ("employee_id","leave_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_ledger_idem_uq" ON "leave_ledger" USING btree ("employee_id","leave_type_id","idempotency_key") WHERE "leave_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "leave_requests_company_status_idx" ON "leave_requests" USING btree ("company_id","status","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_dates_idx" ON "leave_requests" USING btree ("employee_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_company_code_uq" ON "leave_types" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "pay_exports_period_idx" ON "pay_exports" USING btree ("pay_period_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pay_period_lines_uq" ON "pay_period_lines" USING btree ("pay_period_id","employee_id","pay_code");--> statement-breakpoint
CREATE INDEX "pay_period_lines_employee_idx" ON "pay_period_lines" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_periods_company_start_uq" ON "pay_periods" USING btree ("company_id","start_date");--> statement-breakpoint
CREATE INDEX "pay_periods_company_dates_idx" ON "pay_periods" USING btree ("company_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "site_closures_location_dates_idx" ON "site_closures" USING btree ("location_id","start_date","end_date");
--> statement-breakpoint
-- clock_events is an append-only ledger: corrections are new rows, never edits.
CREATE OR REPLACE FUNCTION forbid_clock_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'clock_events is immutable (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS clock_events_immutable ON clock_events;--> statement-breakpoint
CREATE TRIGGER clock_events_immutable
  BEFORE UPDATE OR DELETE ON clock_events
  FOR EACH ROW EXECUTE FUNCTION forbid_clock_event_mutation();
