CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."extraction_field_status" AS ENUM('auto', 'confirmed', 'corrected', 'undetected');--> statement-breakpoint
CREATE TYPE "public"."scan_document_status" AS ENUM('uploaded', 'processing', 'pending_review', 'reviewed', 'reconciled', 'with_differences', 'confirmed', 'duplicate', 'rejected', 'error');--> statement-breakpoint
CREATE SEQUENCE "public"."crm_num_cliente_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "employee_pins" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anviz_id" text,
	"nfc_id" text,
	"contract_type" text,
	"weekly_hours" numeric,
	"phone" text,
	"dni" text,
	"hourly_rate" numeric,
	"legacy_fichaje_id" text,
	"last_name" text,
	"employee_number" text,
	"email" text,
	"address" text,
	"hire_date" date,
	"termination_date" date,
	"emp_status" text DEFAULT 'active' NOT NULL,
	"position_id" uuid,
	"department_id" uuid,
	"work_center_id" uuid,
	"monthly_salary" numeric(10, 2),
	"employer_cost_rate" numeric(5, 4) DEFAULT '1.35' NOT NULL,
	"external_code" text,
	"photo_url" text,
	"emergency_contact" jsonb,
	"emp_notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "employees_anviz_id_unique" UNIQUE("anviz_id"),
	CONSTRAINT "employees_nfc_id_unique" UNIQUE("nfc_id")
);
--> statement-breakpoint
CREATE TABLE "room_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'dining' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"color" text,
	"icon" text,
	"active_layout" text DEFAULT 'normal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'free' NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 80 NOT NULL,
	"height" integer DEFAULT 80 NOT NULL,
	"shape" text DEFAULT 'square' NOT NULL,
	"merge_group" text,
	"rotation" integer DEFAULT 0 NOT NULL,
	"layout" text DEFAULT 'normal' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid,
	"employee_id" uuid,
	"order_type" text DEFAULT 'table' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"opened_by_terminal" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"channel" text DEFAULT 'tpv' NOT NULL,
	"delivery_type" text DEFAULT 'table' NOT NULL,
	"order_number" text,
	"scheduled_at" timestamp with time zone,
	"estimated_ready_at" timestamp with time zone,
	"client_phone" text DEFAULT '' NOT NULL,
	"delivery_address_id" uuid,
	"courier_id" uuid,
	"rejection_reason" text,
	"online_payment_ref" text,
	"online_payment_status" text DEFAULT 'none' NOT NULL,
	"packaging_checked_by" uuid,
	"packaging_checked_at" timestamp with time zone,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"color" text,
	"icon" text,
	"name_en" text DEFAULT '' NOT NULL,
	"translations" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"cost" numeric(10, 2),
	"prep_time" integer,
	"kds_destination" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"tax_rate" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"name" text NOT NULL,
	"internal_code" text,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"cost" numeric(10, 2),
	"image_url" text,
	"video_url" text,
	"prep_zone" text DEFAULT 'cocina' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"tpv_visible" boolean DEFAULT true NOT NULL,
	"qr_visible" boolean DEFAULT true NOT NULL,
	"delivery_visible" boolean DEFAULT false NOT NULL,
	"out_of_stock" boolean DEFAULT false NOT NULL,
	"allergens" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tax_rate" integer DEFAULT 10 NOT NULL,
	"half_portion_price" numeric(10, 2),
	"quantity" text,
	"is_vegetariano" boolean DEFAULT false NOT NULL,
	"is_vegano" boolean DEFAULT false NOT NULL,
	"is_sin_gluten" boolean DEFAULT false NOT NULL,
	"is_picante" boolean DEFAULT false NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"name_es" text DEFAULT '' NOT NULL,
	"description_es" text DEFAULT '' NOT NULL,
	"qr_item_translations" jsonb
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"prep_zone" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"allergy_note" text DEFAULT '' NOT NULL,
	"has_allergy" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"format_id" uuid,
	"format_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"tax_rate" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"allergy_note" text DEFAULT '' NOT NULL,
	"has_allergy" boolean DEFAULT false NOT NULL,
	"is_invitation" boolean DEFAULT false NOT NULL,
	"original_table_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_modifier_groups" (
	"product_id" uuid NOT NULL,
	"modifier_group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"modifier_id" uuid,
	"modifier_name" text NOT NULL,
	"price_delta" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiter_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_float" numeric(10, 2) DEFAULT '0' NOT NULL,
	"closed_at" timestamp with time zone,
	"expected_cash" numeric(10, 2),
	"counted_cash" numeric(10, 2),
	"difference" numeric(10, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"terminal_name" text DEFAULT 'Caja principal' NOT NULL,
	"blind_close" boolean DEFAULT false NOT NULL,
	"notes" text,
	"discrepancy_reason" text,
	"closing_notes" text,
	"denomination_breakdown" jsonb,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"cash_session_id" uuid,
	"payment_method_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"reference" text,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_number" bigserial NOT NULL,
	"serie" text DEFAULT 'T' NOT NULL,
	"nif_emisor" text DEFAULT '' NOT NULL,
	"razon_social_emisor" text DEFAULT '' NOT NULL,
	"direccion_emisor" text DEFAULT '' NOT NULL,
	"forma_pago" text DEFAULT '' NOT NULL,
	"verifactu_status" text DEFAULT 'pending' NOT NULL,
	"verifactu_response" text,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"tax_breakdown" jsonb,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cash_session_id" uuid,
	"employee_id" uuid NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tickets_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "canvas_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"layout" text DEFAULT 'normal' NOT NULL,
	"type" text NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 120 NOT NULL,
	"height" integer DEFAULT 20 NOT NULL,
	"rotation" integer DEFAULT 0 NOT NULL,
	"color" text,
	"label" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"order_id" uuid,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_proxima_min" integer DEFAULT 30 NOT NULL,
	"sin_comanda_min" integer DEFAULT 15 NOT NULL,
	"prefactura_pendiente_min" integer DEFAULT 10 NOT NULL,
	"mesa_sucia_min" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_comercial" text DEFAULT '' NOT NULL,
	"razon_social" text DEFAULT '' NOT NULL,
	"nif" text DEFAULT '' NOT NULL,
	"direccion_fiscal" text DEFAULT '' NOT NULL,
	"codigo_postal" text DEFAULT '' NOT NULL,
	"poblacion" text DEFAULT '' NOT NULL,
	"provincia" text DEFAULT '' NOT NULL,
	"pais" text DEFAULT 'España' NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"web" text DEFAULT '' NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hero_image_url" text DEFAULT '' NOT NULL,
	"hero_video_url" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"founded_year" integer,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"opening_hours" jsonb,
	"card_layout" text DEFAULT 'grid' NOT NULL,
	"accent_color" text DEFAULT '#ef4444' NOT NULL,
	"print_mode" text DEFAULT 'kds_only' NOT NULL,
	"print_template_config" jsonb,
	"moneda" text DEFAULT 'EUR' NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"regimen_fiscal" text DEFAULT 'general' NOT NULL,
	"setup_completed" boolean DEFAULT false NOT NULL,
	"go_live_at" timestamp with time zone,
	"qr_city" text DEFAULT '' NOT NULL,
	"qr_province" text DEFAULT '' NOT NULL,
	"qr_postal_code" text DEFAULT '' NOT NULL,
	"qr_country" text DEFAULT '' NOT NULL,
	"theme_colors" jsonb,
	"theme_fonts" jsonb,
	"card_settings" jsonb,
	"qr_schedule" jsonb
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nif" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"cp" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"province" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'España' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"document_type" text DEFAULT '' NOT NULL,
	"document_id" text DEFAULT '' NOT NULL,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"terminal" text DEFAULT '' NOT NULL,
	"print_count" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 2),
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_reprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" text NOT NULL,
	"document_type" text NOT NULL,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"document_type" text NOT NULL,
	"print_format" text DEFAULT 'thermal_80mm' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serie" text NOT NULL,
	"document_type" text NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_series_serie_doctype_uniq" UNIQUE("serie","document_type")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serie" text DEFAULT 'F' NOT NULL,
	"invoice_number" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operation_date" timestamp with time zone,
	"emisor_nombre" text DEFAULT '' NOT NULL,
	"emisor_nif" text DEFAULT '' NOT NULL,
	"emisor_direccion" text DEFAULT '' NOT NULL,
	"emisor_cp" text DEFAULT '' NOT NULL,
	"emisor_poblacion" text DEFAULT '' NOT NULL,
	"emisor_provincia" text DEFAULT '' NOT NULL,
	"emisor_pais" text DEFAULT 'España' NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"client_nif" text DEFAULT '' NOT NULL,
	"client_address" text DEFAULT '' NOT NULL,
	"client_cp" text DEFAULT '' NOT NULL,
	"client_city" text DEFAULT '' NOT NULL,
	"client_province" text DEFAULT '' NOT NULL,
	"client_country" text DEFAULT 'España' NOT NULL,
	"client_email" text DEFAULT '' NOT NULL,
	"client_phone" text DEFAULT '' NOT NULL,
	"order_id" uuid,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"tax_breakdown" jsonb,
	"payment_method" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"original_invoice_id" uuid,
	"rectification_reason" text DEFAULT '' NOT NULL,
	"verifactu_status" text DEFAULT 'pending' NOT NULL,
	"verifactu_response" jsonb,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prefactura_prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"prefactura_number" integer DEFAULT nextval('prefactura_number_seq') NOT NULL,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"amount" numeric(10, 2),
	"printed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printer_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"printer_type" text DEFAULT 'thermal' NOT NULL,
	"paper_width" integer DEFAULT 80 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"document_type" text DEFAULT 'ticket' NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"auto_cut" boolean DEFAULT true NOT NULL,
	"cash_drawer" boolean DEFAULT false NOT NULL,
	"auto_print" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"type" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"authorized_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_payment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"authorized_by" uuid NOT NULL,
	"cash_session_id" uuid,
	"counter_movement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_group_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_group_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_group_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_group_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"cash_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"icon" text DEFAULT '📦' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_cost_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"previous_cost" numeric(10, 4) NOT NULL,
	"new_cost" numeric(10, 4) NOT NULL,
	"supplier_name" text,
	"reason" text,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"internal_code" text,
	"category_id" uuid,
	"location_id" uuid,
	"unit" text DEFAULT 'ud' NOT NULL,
	"purchase_unit" text DEFAULT 'ud' NOT NULL,
	"consumption_unit" text DEFAULT 'ud' NOT NULL,
	"conversion_factor" numeric(10, 4) DEFAULT '1' NOT NULL,
	"purchase_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"average_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"last_purchase_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"current_stock" numeric(10, 4) DEFAULT '0' NOT NULL,
	"min_stock" numeric(10, 4) DEFAULT '0' NOT NULL,
	"optimal_stock" numeric(10, 4) DEFAULT '0' NOT NULL,
	"max_stock" numeric(10, 4) DEFAULT '0' NOT NULL,
	"supplier_name" text,
	"allergen_tags" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"format_id" uuid,
	"ingredient_id" uuid,
	"subrecipe_id" uuid,
	"quantity" numeric(10, 4) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'ud' NOT NULL,
	"waste_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"packaging_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"additional_cost" numeric(10, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" numeric(10, 4) NOT NULL,
	"unit_cost" numeric(10, 4),
	"reason" text DEFAULT '' NOT NULL,
	"employee_id" uuid,
	"order_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"temperature" text DEFAULT 'ambient' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subrecipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subrecipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(10, 4) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'ud' NOT NULL,
	"waste_percent" numeric(5, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subrecipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'ud' NOT NULL,
	"yield_quantity" numeric(10, 4) DEFAULT '1' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waste_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(10, 4) NOT NULL,
	"unit" text DEFAULT 'ud' NOT NULL,
	"unit_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"waste_type" text DEFAULT 'expired' NOT NULL,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"importe_solicitado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"importe_pagado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"forma_pago" text,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"devolucion_motivo" text,
	"devolucion_fecha" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status_from" text NOT NULL,
	"status_to" text NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"hora" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"personas" integer DEFAULT 2 NOT NULL,
	"client_id" uuid,
	"shift_id" uuid,
	"zona_preferida" text,
	"mesa_id" uuid,
	"duracion_minutos" integer DEFAULT 90 NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"alergias" text DEFAULT '' NOT NULL,
	"trona" boolean DEFAULT false NOT NULL,
	"accesibilidad" boolean DEFAULT false NOT NULL,
	"mascota" boolean DEFAULT false NOT NULL,
	"ocasion" text,
	"canal" text DEFAULT 'phone' NOT NULL,
	"recordatorio_enviado" boolean DEFAULT false NOT NULL,
	"confirmacion_requerida" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"notas_internas" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'comida' NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"intervalo_minutos" integer DEFAULT 15 NOT NULL,
	"capacidad_max" integer DEFAULT 50 NOT NULL,
	"max_reservas" integer DEFAULT 20 NOT NULL,
	"max_comensales" integer DEFAULT 50 NOT NULL,
	"duracion_default" integer DEFAULT 90 NOT NULL,
	"dias_activos" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiting_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	"personas" integer DEFAULT 2 NOT NULL,
	"hora_llegada" timestamp with time zone DEFAULT now() NOT NULL,
	"zona_preferida" text,
	"tiempo_estimado" integer,
	"status" text DEFAULT 'esperando' NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_machine_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer" text DEFAULT 'simulator' NOT NULL,
	"model" text DEFAULT 'Simulator v1' NOT NULL,
	"host" text DEFAULT 'localhost' NOT NULL,
	"port" integer DEFAULT 8080 NOT NULL,
	"connection_type" text DEFAULT 'tcp' NOT NULL,
	"device_id" text DEFAULT 'device-1' NOT NULL,
	"credential_key" text,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_machine_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"split_ref" text,
	"transaction_type" text NOT NULL,
	"amount_requested" numeric(10, 2) NOT NULL,
	"amount_received" numeric(10, 2) DEFAULT '0' NOT NULL,
	"change_dispensed" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"device_transaction_id" text,
	"device_error" text,
	"employee_id" uuid,
	"terminal_name" text DEFAULT 'Caja principal' NOT NULL,
	"device_id" text DEFAULT 'device-1' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"order_item_id" uuid,
	"ingredient_id" uuid NOT NULL,
	"qty_ordered" numeric(10, 4) DEFAULT '0',
	"qty_received" numeric(10, 4) NOT NULL,
	"qty_rejected" numeric(10, 4) DEFAULT '0',
	"unit_price" numeric(10, 4) DEFAULT '0' NOT NULL,
	"lot_number" text,
	"expiry_date" date,
	"temperature" numeric(5, 2),
	"incidents" text,
	"substitution" text
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"supplier_id" uuid NOT NULL,
	"receipt_number" text,
	"receipt_date" timestamp with time zone DEFAULT now() NOT NULL,
	"total_amount" numeric(12, 4) DEFAULT '0',
	"incidents" text,
	"attachment_url" text,
	"received_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"expiry_date" date,
	"initial_qty" numeric(10, 4) NOT NULL,
	"remaining_qty" numeric(10, 4) NOT NULL,
	"supplier_id" uuid,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"employee_id" uuid,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_catalog_item_id" uuid,
	"quantity" numeric(10, 4) NOT NULL,
	"unit" text DEFAULT 'ud' NOT NULL,
	"unit_price" numeric(10, 4) DEFAULT '0' NOT NULL,
	"vat_pct" numeric(5, 2) DEFAULT '10',
	"discount" numeric(5, 2) DEFAULT '0',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_delivery_date" date,
	"notes" text,
	"total_amount" numeric(12, 4) DEFAULT '0',
	"created_by" uuid,
	"approved_by" uuid,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_ref" text,
	"purchase_format" text,
	"units_per_pack" numeric(10, 4) DEFAULT '1',
	"purchase_unit" text DEFAULT 'ud',
	"price" numeric(10, 4) DEFAULT '0' NOT NULL,
	"vat_pct" numeric(5, 2) DEFAULT '10',
	"discount" numeric(5, 2) DEFAULT '0',
	"transport_cost" numeric(10, 4) DEFAULT '0',
	"is_preferred" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_order_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_receipt_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"taxable_base" numeric(12, 4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(12, 4) DEFAULT '0' NOT NULL,
	"total" numeric(12, 4) DEFAULT '0' NOT NULL,
	"due_date" date,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commercial_name" text NOT NULL,
	"legal_name" text,
	"nif" text,
	"address" text,
	"phone" text,
	"email" text,
	"contact_person" text,
	"payment_terms" text,
	"delivery_days" text,
	"min_order" numeric(10, 2) DEFAULT '0',
	"lead_time_days" integer DEFAULT 1,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_extracted_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"supplier_ref" text,
	"description" text,
	"quantity" numeric(12, 4),
	"unit" text,
	"unit_price" numeric(12, 4),
	"discount" numeric(6, 4),
	"vat_rate" numeric(5, 4),
	"line_total" numeric(12, 4),
	"confidence" numeric(4, 3),
	"status" "extraction_field_status" DEFAULT 'auto',
	"ingredient_id" uuid,
	"conversion_factor" numeric(12, 6),
	"conversion_note" text,
	"mapping_confirmed" boolean DEFAULT false NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"supplier_name" text,
	"supplier_name_confidence" numeric(4, 3),
	"supplier_name_status" "extraction_field_status" DEFAULT 'auto',
	"legal_name" text,
	"legal_name_confidence" numeric(4, 3),
	"legal_name_status" "extraction_field_status" DEFAULT 'auto',
	"nif" text,
	"nif_confidence" numeric(4, 3),
	"nif_status" "extraction_field_status" DEFAULT 'auto',
	"invoice_number" text,
	"invoice_number_confidence" numeric(4, 3),
	"invoice_number_status" "extraction_field_status" DEFAULT 'auto',
	"invoice_date" text,
	"invoice_date_confidence" numeric(4, 3),
	"invoice_date_status" "extraction_field_status" DEFAULT 'auto',
	"due_date" text,
	"due_date_confidence" numeric(4, 3),
	"due_date_status" "extraction_field_status" DEFAULT 'auto',
	"taxable_base" numeric(12, 4),
	"taxable_base_confidence" numeric(4, 3),
	"taxable_base_status" "extraction_field_status" DEFAULT 'auto',
	"vat_breakdown" jsonb,
	"vat_breakdown_confidence" numeric(4, 3),
	"vat_breakdown_status" "extraction_field_status" DEFAULT 'auto',
	"total" numeric(12, 4),
	"total_confidence" numeric(4, 3),
	"total_status" "extraction_field_status" DEFAULT 'auto',
	"payment_method" text,
	"payment_method_confidence" numeric(4, 3),
	"payment_method_status" "extraction_field_status" DEFAULT 'auto',
	"related_order_number" text,
	"related_order_number_confidence" numeric(4, 3),
	"related_order_number_status" "extraction_field_status" DEFAULT 'auto',
	"related_delivery_note" text,
	"related_delivery_note_confidence" numeric(4, 3),
	"related_delivery_note_status" "extraction_field_status" DEFAULT 'auto',
	"overall_confidence" numeric(4, 3),
	"raw_ocr_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_text" text NOT NULL,
	"supplier_ref" text,
	"supplier_unit" text,
	"ingredient_id" uuid,
	"conversion_factor" numeric(12, 6),
	"internal_unit" text,
	"times_used" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_scan_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_scan_order_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"order_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_scan_receipt_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scanned_invoice_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_path" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" "scan_document_status" DEFAULT 'uploaded' NOT NULL,
	"processing_error" text,
	"supplier_id" uuid,
	"supplier_invoice_id" uuid,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_of_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"confirmed_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "allergen_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"actor_name" text DEFAULT '' NOT NULL,
	"terminal" text,
	"before" jsonb,
	"after" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allergens_catalog" (
	"code" text PRIMARY KEY NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon_slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allergy_override_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"allergen_code" text NOT NULL,
	"guest_allergy_id" uuid,
	"authorized_by" uuid,
	"reason" text,
	"overridden_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_allergen_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"change_reason" text,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingredient_allergens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"allergen_code" text NOT NULL,
	"type" text DEFAULT 'contains' NOT NULL,
	"manufacturer_info" text,
	"technical_doc_url" text,
	"last_reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_substitutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"order_item_id" uuid,
	"original_ingredient_id" uuid,
	"substitute_ingredient_id" uuid,
	"original_ingredient_name" text NOT NULL,
	"substitute_ingredient_name" text NOT NULL,
	"new_allergen_summary" jsonb DEFAULT '[]'::jsonb,
	"authorized_by" uuid,
	"waiter_confirmed_at" timestamp with time zone,
	"substituted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_allergy_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"guest_allergy_ids" jsonb DEFAULT '[]'::jsonb,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"has_cross_contamination_risk" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"ingredient_id" uuid,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_by" uuid,
	"reason" text NOT NULL,
	"block_report" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolve_note" text
);
--> statement-breakpoint
CREATE TABLE "product_allergen_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"allergen_code" text NOT NULL,
	"type" text NOT NULL,
	"source" text DEFAULT 'ingredient' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_allergen_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"allergen_code" text NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_technical_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"content" jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_guest_allergies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid,
	"order_id" uuid NOT NULL,
	"guest_number" text DEFAULT '1' NOT NULL,
	"allergen_code" text NOT NULL,
	"severity" text DEFAULT 'intolerance' NOT NULL,
	"notes" text,
	"registered_by" uuid,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"absence_date" date NOT NULL,
	"absence_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"break_start" timestamp with time zone NOT NULL,
	"break_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"rows_errored" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"imported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fichaje_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"employee_id" uuid,
	"performed_by" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fichaje_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT 'Piccolo La Ràpita' NOT NULL,
	"locale" text DEFAULT 'es-ES' NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"week_start" text DEFAULT 'monday' NOT NULL,
	"mobile_clock_enabled" boolean DEFAULT false NOT NULL,
	"report_email" text,
	"report_day_of_week" integer DEFAULT 1,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_split" boolean DEFAULT false NOT NULL,
	"split_start_time" text,
	"split_end_time" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "time_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"before_data" jsonb NOT NULL,
	"after_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"source" text DEFAULT 'pin' NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"import_history_id" uuid,
	"import_row_id" uuid,
	"external_record_id" text,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE "verifactu_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"invoice_id" uuid,
	"accion" text NOT NULL,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"terminal" text DEFAULT '' NOT NULL,
	"resultado" text DEFAULT 'ok' NOT NULL,
	"detalles" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifactu_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emisor_nif" text DEFAULT '' NOT NULL,
	"emisor_nombre" text DEFAULT '' NOT NULL,
	"id_sistema_informatico" text DEFAULT 'PICCOLO-TPV' NOT NULL,
	"nombre_sistema_informatico" text DEFAULT 'Piccolo TPV' NOT NULL,
	"version_sistema" text DEFAULT '1.0.0' NOT NULL,
	"numero_instalacion" text DEFAULT '' NOT NULL,
	"entorno" text DEFAULT 'simulador' NOT NULL,
	"endpoint_pruebas" text DEFAULT 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/SuministroLRWS' NOT NULL,
	"endpoint_produccion" text DEFAULT 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SuministroLRWS' NOT NULL,
	"certificado_path" text DEFAULT '' NOT NULL,
	"certificado_password_enc" text DEFAULT '' NOT NULL,
	"auto_retry" boolean DEFAULT true NOT NULL,
	"max_reintentos" integer DEFAULT 3 NOT NULL,
	"retry_interval_minutes" integer DEFAULT 30 NOT NULL,
	"activo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifactu_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"registro_tipo" text DEFAULT 'alta' NOT NULL,
	"tipo_factura" text DEFAULT 'F2' NOT NULL,
	"serie" text NOT NULL,
	"numero" integer NOT NULL,
	"num_serie_factura" text NOT NULL,
	"fecha_expedicion" text NOT NULL,
	"fecha_hora_generacion" text NOT NULL,
	"emisor_nif" text NOT NULL,
	"emisor_nombre" text NOT NULL,
	"destinatario_nif" text DEFAULT '' NOT NULL,
	"destinatario_nombre" text DEFAULT '' NOT NULL,
	"descripcion" text DEFAULT 'Servicios de hostelería' NOT NULL,
	"base_imponible" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tipo_iva" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"cuota_iva" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cuota_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"importe_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"desglose_iva" jsonb,
	"tipo_rectificativa" text DEFAULT '' NOT NULL,
	"factura_rectificada_serie" text DEFAULT '' NOT NULL,
	"factura_rectificada_numero" integer,
	"factura_rectificada_fecha" text DEFAULT '' NOT NULL,
	"motivo_rectificacion" text DEFAULT '' NOT NULL,
	"registro_anulado_id" uuid,
	"motivo_anulacion" text DEFAULT '' NOT NULL,
	"autorizador_anulacion" text DEFAULT '' NOT NULL,
	"huella_anterior" text DEFAULT '' NOT NULL,
	"huella" text NOT NULL,
	"id_sistema_informatico" text DEFAULT 'PICCOLO-TPV' NOT NULL,
	"nombre_sistema_informatico" text DEFAULT 'Piccolo TPV' NOT NULL,
	"version_sistema" text DEFAULT '1.0' NOT NULL,
	"numero_instalacion" text DEFAULT '' NOT NULL,
	"es_verifactu" boolean DEFAULT true NOT NULL,
	"qr_content" text DEFAULT '' NOT NULL,
	"xml_payload" text,
	"estado" text DEFAULT 'validado' NOT NULL,
	"aeat_fecha_envio" timestamp with time zone,
	"aeat_codigo" text DEFAULT '' NOT NULL,
	"aeat_descripcion" text DEFAULT '' NOT NULL,
	"aeat_csv" text DEFAULT '' NOT NULL,
	"aeat_response" jsonb,
	"reintentos" integer DEFAULT 0 NOT NULL,
	"proximo_reintento" timestamp with time zone,
	"xml_enviado" text,
	"xml_respuesta" text,
	"entorno_envio" text DEFAULT 'simulador' NOT NULL,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion" text NOT NULL,
	"client_id" uuid,
	"entidad_tipo" text DEFAULT '' NOT NULL,
	"entidad_id" uuid,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"terminal" text DEFAULT '' NOT NULL,
	"datos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_campaign_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"canal" text DEFAULT '' NOT NULL,
	"enviado_en" timestamp with time zone,
	"fallido_en" timestamp with time zone,
	"error" text,
	"usado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"canal" text DEFAULT 'email' NOT NULL,
	"asunto" text DEFAULT '' NOT NULL,
	"contenido" text DEFAULT '' NOT NULL,
	"segmento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fecha_envio" timestamp with time zone,
	"fecha_fin" timestamp with time zone,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"total_enviados" integer DEFAULT 0 NOT NULL,
	"total_entregados" integer DEFAULT 0 NOT NULL,
	"total_fallidos" integer DEFAULT 0 NOT NULL,
	"total_usados" integer DEFAULT 0 NOT NULL,
	"promotion_id" uuid,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"apellidos" text DEFAULT '' NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"fecha_nacimiento" date,
	"direccion" text DEFAULT '' NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"rgpd_consentimiento" boolean DEFAULT false NOT NULL,
	"rgpd_fecha" timestamp with time zone,
	"total_gasto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_visitas" integer DEFAULT 0 NOT NULL,
	"ultima_visita" timestamp with time zone,
	"puntos_saldo" integer DEFAULT 0 NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"mesa_favorita_id" uuid,
	"zona_favorita" text,
	"rgpd_marketing" boolean DEFAULT false NOT NULL,
	"notas_internas" text DEFAULT '' NOT NULL,
	"flag_no_presentado" boolean DEFAULT false NOT NULL,
	"bloqueo_online" boolean DEFAULT false NOT NULL,
	"cancelaciones" integer DEFAULT 0 NOT NULL,
	"no_presentados" integer DEFAULT 0 NOT NULL,
	"num_cliente" integer,
	"qr_token" text,
	"nivel_id" uuid,
	"nivel_nombre" text DEFAULT '' NOT NULL,
	"saldo_monedero" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"valor" boolean NOT NULL,
	"canal_origen" text DEFAULT '' NOT NULL,
	"texto_aceptado" text DEFAULT '' NOT NULL,
	"version_legal" text DEFAULT '1.0' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"revocado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_coupon_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"client_id" uuid,
	"order_id" uuid,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_demo_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabla" text NOT NULL,
	"row_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_gift_card_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"order_id" uuid,
	"tipo" text NOT NULL,
	"importe" numeric(10, 2) NOT NULL,
	"saldo_anterior" numeric(10, 2) NOT NULL,
	"saldo_posterior" numeric(10, 2) NOT NULL,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"notas" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"saldo_inicial" numeric(10, 2) DEFAULT '0' NOT NULL,
	"saldo_actual" numeric(10, 2) DEFAULT '0' NOT NULL,
	"client_id" uuid,
	"estado" text DEFAULT 'activa' NOT NULL,
	"fecha_caducidad" timestamp with time zone,
	"notas" text DEFAULT '' NOT NULL,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"beneficiario_email" text DEFAULT '' NOT NULL,
	"beneficiario_nombre" text DEFAULT '' NOT NULL,
	"mensaje_personalizado" text DEFAULT '' NOT NULL,
	"tipo_entrega" text DEFAULT 'digital' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_gift_cards_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "crm_loyalty_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activo" boolean DEFAULT false NOT NULL,
	"puntos_por_euro" numeric(8, 2) DEFAULT '1' NOT NULL,
	"valor_punto" numeric(8, 4) DEFAULT '0.01' NOT NULL,
	"caducidad_dias" integer DEFAULT 0 NOT NULL,
	"canje_minimo" integer DEFAULT 100 NOT NULL,
	"bonificaciones_categorias" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"puntos_extra_cumpleanos" integer DEFAULT 0 NOT NULL,
	"puntos_extra_primera_compra" integer DEFAULT 0 NOT NULL,
	"puntos_extra_reserva" integer DEFAULT 0 NOT NULL,
	"puntos_extra_recogida" integer DEFAULT 0 NOT NULL,
	"puntos_extra_online" integer DEFAULT 0 NOT NULL,
	"reglas_por_producto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"canje_max_por_operacion" integer DEFAULT 0 NOT NULL,
	"caducidad_aviso_dias" integer DEFAULT 7 NOT NULL,
	"niveles_activos" boolean DEFAULT false NOT NULL,
	"monedero_activo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_loyalty_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"requisito_gasto" numeric(10, 2) DEFAULT '0' NOT NULL,
	"requisito_visitas" integer DEFAULT 0 NOT NULL,
	"multiplicador_puntos" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"descuento_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"beneficios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"icono" text DEFAULT '⭐' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_loyalty_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"puntos" integer NOT NULL,
	"saldo_anterior" integer DEFAULT 0 NOT NULL,
	"saldo_posterior" integer DEFAULT 0 NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"order_id" uuid,
	"campania_id" uuid,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"expira_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(10, 2) DEFAULT '0' NOT NULL,
	"codigo" text DEFAULT '' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"fecha_inicio" timestamp with time zone,
	"fecha_fin" timestamp with time zone,
	"dias_semana" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hora_inicio" text DEFAULT '' NOT NULL,
	"hora_fin" text DEFAULT '' NOT NULL,
	"categoria_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monto_minimo" numeric(10, 2) DEFAULT '0' NOT NULL,
	"uso_maximo" integer DEFAULT 0 NOT NULL,
	"uso_actual" integer DEFAULT 0 NOT NULL,
	"uso_maximo_por_cliente" integer DEFAULT 0 NOT NULL,
	"canal" text DEFAULT '' NOT NULL,
	"compatible" boolean DEFAULT true NOT NULL,
	"codigo_unico" boolean DEFAULT false NOT NULL,
	"producto_gratis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"saldo_real" numeric(10, 2) DEFAULT '0' NOT NULL,
	"saldo_promo" numeric(10, 2) DEFAULT '0' NOT NULL,
	"saldo_compensacion" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_wallet_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "crm_wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"subtipo" text DEFAULT '' NOT NULL,
	"importe" numeric(10, 2) NOT NULL,
	"saldo_anterior" numeric(10, 2) DEFAULT '0' NOT NULL,
	"saldo_posterior" numeric(10, 2) DEFAULT '0' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"order_id" uuid,
	"empleado_id" uuid,
	"empleado_nombre" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courier_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"total_cash" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_card" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_online" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tips" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expenses" numeric(10, 2) DEFAULT '0' NOT NULL,
	"differences" numeric(10, 2) DEFAULT '0' NOT NULL,
	"closed_by" uuid,
	"closed_by_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vehicle_type" text DEFAULT 'moto' NOT NULL,
	"plate" text DEFAULT '' NOT NULL,
	"zona_habitual" text DEFAULT '' NOT NULL,
	"turno" text DEFAULT '' NOT NULL,
	"earned_cash_pending" numeric(10, 2) DEFAULT '0' NOT NULL,
	"earned_card_pending" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_deliveries" integer DEFAULT 0 NOT NULL,
	"avg_delivery_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"floor" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" uuid,
	"changed_by_name" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'postal_code' NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estimated_minutes" integer DEFAULT 45 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"delivery_type" text DEFAULT 'takeaway' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_order_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event" text NOT NULL,
	"user_id" uuid,
	"user_name" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_orders_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"takeaway_enabled" boolean DEFAULT false NOT NULL,
	"delivery_enabled" boolean DEFAULT false NOT NULL,
	"schedule" jsonb,
	"prep_time_minutes" integer DEFAULT 30 NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order_delivery" numeric(10, 2) DEFAULT '15' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '3' NOT NULL,
	"free_delivery_from" numeric(10, 2),
	"max_advance_hours" integer DEFAULT 48 NOT NULL,
	"max_orders_per_slot" integer DEFAULT 10 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text DEFAULT '' NOT NULL,
	"tip_enabled" boolean DEFAULT false NOT NULL,
	"tip_percentages" jsonb DEFAULT '[5,10,15,20]'::jsonb NOT NULL,
	"table_ordering_enabled" boolean DEFAULT false NOT NULL,
	"stripe_publishable_key" text DEFAULT '' NOT NULL,
	"stripe_secret_key" text DEFAULT '' NOT NULL,
	"stripe_webhook_secret" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"raw_response" jsonb,
	"refunded_at" timestamp with time zone,
	"refund_ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"category_id" uuid,
	"label" text DEFAULT '' NOT NULL,
	"days_of_week" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"time_from" text DEFAULT '00:00' NOT NULL,
	"time_to" text DEFAULT '23:59' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid,
	"zone_id" uuid,
	"table_label" text DEFAULT '' NOT NULL,
	"zone_label" text DEFAULT '' NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"guest_name" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_queue_id" uuid,
	"action" text NOT NULL,
	"actor_id" text,
	"actor_name" text DEFAULT 'sistema' NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid NOT NULL,
	"order_id" uuid,
	"document_type" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"printed_at" timestamp with time zone,
	"actor_id" text,
	"actor_name" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_routing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"printer_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cocina' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"port" integer DEFAULT 9100 NOT NULL,
	"paper_width" integer DEFAULT 80 NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"fallback_printer_id" uuid,
	"last_status" text DEFAULT 'unknown' NOT NULL,
	"last_status_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_employee_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"device_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_employee_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_employee_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_by" uuid,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_import_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_format" text DEFAULT 'csv' NOT NULL,
	"template_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"rows_errors" integer DEFAULT 0 NOT NULL,
	"rows_pending" integer DEFAULT 0 NOT NULL,
	"column_mapping" jsonb,
	"errors" jsonb,
	"parsed_rows" jsonb,
	"imported_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"revert_reason" text,
	"reverted_by" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"employee_id" uuid,
	"external_identifier" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matched_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"time_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_import_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"file_format" text DEFAULT 'csv' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"planned_hours" numeric(8, 2),
	"actual_hours" numeric(8, 2),
	"estimated_cost" numeric(10, 2),
	"total_sales" numeric(12, 2),
	"notes" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"reopened_by" uuid,
	"reopened_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"department_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_work_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"assigned_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"action_taken" text,
	"snooze_until" timestamp with time zone,
	"comments" jsonb,
	"origin_module" text,
	"origin_ref" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"periodicity" text DEFAULT 'monthly' NOT NULL,
	"effective_date" date NOT NULL,
	"end_date" date,
	"provider" text,
	"cost_center" text,
	"document_ref" text,
	"notes" text,
	"paid_status" text DEFAULT 'pending' NOT NULL,
	"payment_date" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_custom_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" date NOT NULL,
	"sales_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sales_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"invitation_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ticket_count" integer DEFAULT 0 NOT NULL,
	"guest_count" integer DEFAULT 0 NOT NULL,
	"avg_ticket" numeric(10, 2) DEFAULT '0' NOT NULL,
	"avg_per_guest" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sales_dine_in" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sales_delivery" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sales_takeaway" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sales_online" numeric(14, 2) DEFAULT '0' NOT NULL,
	"orders_delivery" integer DEFAULT 0 NOT NULL,
	"orders_takeaway" integer DEFAULT 0 NOT NULL,
	"labor_cost_est" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cogs_est" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reservations_total" integer DEFAULT 0 NOT NULL,
	"reservations_kept" integer DEFAULT 0 NOT NULL,
	"avg_prep_minutes" numeric(6, 2),
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_partial" boolean DEFAULT false NOT NULL,
	CONSTRAINT "director_daily_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "director_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"label" text,
	"target_value" numeric(14, 4) NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"period_start" date,
	"period_end" date,
	"zone_id" uuid,
	"channel" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_id" uuid,
	"action" text NOT NULL,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text DEFAULT 'ok' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "backup_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'manual' NOT NULL,
	"backup_type" text DEFAULT 'full' NOT NULL,
	"app_version" text DEFAULT '1.0.0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"size_bytes" integer,
	"record_counts" jsonb DEFAULT '{}'::jsonb,
	"tables_included" jsonb DEFAULT '[]'::jsonb,
	"integrity_hash" text,
	"verified_at" timestamp with time zone,
	"verified" boolean DEFAULT false NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"encrypted_payload" text,
	"encryption_iv" text,
	"destination_id" uuid,
	"schedule_id" uuid,
	"pre_action" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dest_type" text DEFAULT 'internal' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"hour" integer DEFAULT 3 NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"backup_type" text DEFAULT 'full' NOT NULL,
	"retention" integer DEFAULT 7 NOT NULL,
	"destination_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"event" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"device_type" text DEFAULT 'tpv' NOT NULL,
	"device_subtype" text DEFAULT 'otro' NOT NULL,
	"fingerprint" text NOT NULL,
	"employee_id" uuid,
	"status" text DEFAULT 'offline' NOT NULL,
	"offline_perms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"pending_ops" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"mac_address" text,
	"os" text,
	"browser_version" text,
	"assigned_zone_id" uuid,
	"default_printer_id" uuid,
	"cobro_permitido" boolean DEFAULT true NOT NULL,
	"offline_autorizado" boolean DEFAULT true NOT NULL,
	"usuario_habitual" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_devices_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "offline_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"employee_id" uuid,
	"operation_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"result_payload" jsonb,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_queue_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "tech_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"module" text DEFAULT 'system' NOT NULL,
	"device_id" uuid,
	"message" text NOT NULL,
	"code" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"step" text NOT NULL,
	"action" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_wizard_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text DEFAULT 'full' NOT NULL,
	"current_step" text DEFAULT 'identidad' NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skipped_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"go_live_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"severity" text DEFAULT 'ok' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"run_id" text,
	"automated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"triggered_by" text,
	"modules_checked" integer DEFAULT 0 NOT NULL,
	"findings_count" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "installation_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tablet_number" integer,
	"device_category" text DEFAULT 'tablet' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"os" text DEFAULT '' NOT NULL,
	"browser" text DEFAULT '' NOT NULL,
	"ram" text DEFAULT '' NOT NULL,
	"processor" text DEFAULT '' NOT NULL,
	"disk_space" text DEFAULT '' NOT NULL,
	"app_version" text DEFAULT '' NOT NULL,
	"ip_local" text DEFAULT '' NOT NULL,
	"connection_type" text DEFAULT 'wifi' NOT NULL,
	"usual_employee_name" text DEFAULT '' NOT NULL,
	"usual_zone" text DEFAULT '' NOT NULL,
	"payment_allowed" boolean DEFAULT false NOT NULL,
	"offline_authorized" boolean DEFAULT true NOT NULL,
	"default_printer_id" uuid,
	"main_printer_associated" text DEFAULT '' NOT NULL,
	"cash_associated" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_type" text NOT NULL,
	"device_id" uuid,
	"device_name" text DEFAULT '' NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"performed_by" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"support_phone" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manuals_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "network_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ip" text NOT NULL,
	"mac" text DEFAULT '' NOT NULL,
	"device_type" text DEFAULT 'other' NOT NULL,
	"zone" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_connection_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kds_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"zone_type" text DEFAULT 'cocina' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"display_url" text,
	"notes" text,
	"last_ping_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"step_label" text NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"tested_by" text,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_pins" ADD CONSTRAINT "employee_pins_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_zone_id_room_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."room_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_formats" ADD CONSTRAINT "product_formats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tasks" ADD CONSTRAINT "kitchen_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tasks" ADD CONSTRAINT "kitchen_tasks_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_format_id_product_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."product_formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_id_modifiers_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_notifications" ADD CONSTRAINT "waiter_notifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_notifications" ADD CONSTRAINT "waiter_notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_elements" ADD CONSTRAINT "canvas_elements_zone_id_room_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."room_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_events" ADD CONSTRAINT "table_events_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_events" ADD CONSTRAINT "table_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_events" ADD CONSTRAINT "table_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reprints" ADD CONSTRAINT "document_reprints_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prefactura_prints" ADD CONSTRAINT "prefactura_prints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prefactura_prints" ADD CONSTRAINT "prefactura_prints_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_authorized_by_employees_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_voids" ADD CONSTRAINT "payment_voids_original_payment_id_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_voids" ADD CONSTRAINT "payment_voids_authorized_by_employees_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_voids" ADD CONSTRAINT "payment_voids_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_items" ADD CONSTRAINT "split_group_items_split_group_id_split_groups_id_fk" FOREIGN KEY ("split_group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_items" ADD CONSTRAINT "split_group_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_payments" ADD CONSTRAINT "split_group_payments_split_group_id_split_groups_id_fk" FOREIGN KEY ("split_group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_payments" ADD CONSTRAINT "split_group_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_groups" ADD CONSTRAINT "split_groups_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_cost_history" ADD CONSTRAINT "ingredient_cost_history_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_cost_history" ADD CONSTRAINT "ingredient_cost_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_category_id_ingredient_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_format_id_product_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."product_formats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_subrecipe_id_subrecipes_id_fk" FOREIGN KEY ("subrecipe_id") REFERENCES "public"."subrecipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipe_items" ADD CONSTRAINT "subrecipe_items_subrecipe_id_subrecipes_id_fk" FOREIGN KEY ("subrecipe_id") REFERENCES "public"."subrecipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipe_items" ADD CONSTRAINT "subrecipe_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_deposits" ADD CONSTRAINT "reservation_deposits_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_deposits" ADD CONSTRAINT "reservation_deposits_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_changed_by_employees_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_shift_id_service_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."service_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_mesa_id_restaurant_tables_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_machine_transactions" ADD CONSTRAINT "cash_machine_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_machine_transactions" ADD CONSTRAINT "cash_machine_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_employees_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_lots" ADD CONSTRAINT "ingredient_lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_lots" ADD CONSTRAINT "ingredient_lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_lots" ADD CONSTRAINT "ingredient_lots_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_audit_log" ADD CONSTRAINT "purchase_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_supplier_catalog_item_id_supplier_catalog_items_id_fk" FOREIGN KEY ("supplier_catalog_item_id") REFERENCES "public"."supplier_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_order_links" ADD CONSTRAINT "supplier_invoice_order_links_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_order_links" ADD CONSTRAINT "supplier_invoice_order_links_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_receipt_links" ADD CONSTRAINT "supplier_invoice_receipt_links_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_receipt_links" ADD CONSTRAINT "supplier_invoice_receipt_links_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_extracted_lines" ADD CONSTRAINT "invoice_extracted_lines_document_id_scanned_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scanned_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_extracted_lines" ADD CONSTRAINT "invoice_extracted_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_extractions" ADD CONSTRAINT "invoice_extractions_document_id_scanned_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scanned_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_product_mappings" ADD CONSTRAINT "invoice_product_mappings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_product_mappings" ADD CONSTRAINT "invoice_product_mappings_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_scan_audit_log" ADD CONSTRAINT "invoice_scan_audit_log_document_id_scanned_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scanned_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_scan_order_links" ADD CONSTRAINT "invoice_scan_order_links_document_id_scanned_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scanned_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_scan_order_links" ADD CONSTRAINT "invoice_scan_order_links_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_scan_receipt_links" ADD CONSTRAINT "invoice_scan_receipt_links_document_id_scanned_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scanned_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_scan_receipt_links" ADD CONSTRAINT "invoice_scan_receipt_links_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_invoice_documents" ADD CONSTRAINT "scanned_invoice_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_invoice_documents" ADD CONSTRAINT "scanned_invoice_documents_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_audit_log" ADD CONSTRAINT "allergen_audit_log_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergy_override_log" ADD CONSTRAINT "allergy_override_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergy_override_log" ADD CONSTRAINT "allergy_override_log_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergy_override_log" ADD CONSTRAINT "allergy_override_log_guest_allergy_id_table_guest_allergies_id_fk" FOREIGN KEY ("guest_allergy_id") REFERENCES "public"."table_guest_allergies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergy_override_log" ADD CONSTRAINT "allergy_override_log_authorized_by_employees_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergen_versions" ADD CONSTRAINT "ingredient_allergen_versions_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergen_versions" ADD CONSTRAINT "ingredient_allergen_versions_changed_by_employees_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergen_code_allergens_catalog_code_fk" FOREIGN KEY ("allergen_code") REFERENCES "public"."allergens_catalog"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_task_id_kitchen_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."kitchen_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_original_ingredient_id_ingredients_id_fk" FOREIGN KEY ("original_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_substitute_ingredient_id_ingredients_id_fk" FOREIGN KEY ("substitute_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_authorized_by_employees_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_allergy_confirmations" ADD CONSTRAINT "kitchen_allergy_confirmations_task_id_kitchen_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."kitchen_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_allergy_confirmations" ADD CONSTRAINT "kitchen_allergy_confirmations_confirmed_by_employees_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_blocks" ADD CONSTRAINT "lot_blocks_lot_id_ingredient_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."ingredient_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_blocks" ADD CONSTRAINT "lot_blocks_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_blocks" ADD CONSTRAINT "lot_blocks_blocked_by_employees_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_blocks" ADD CONSTRAINT "lot_blocks_resolved_by_employees_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergen_cache" ADD CONSTRAINT "product_allergen_cache_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergen_cache" ADD CONSTRAINT "product_allergen_cache_allergen_code_allergens_catalog_code_fk" FOREIGN KEY ("allergen_code") REFERENCES "public"."allergens_catalog"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergen_overrides" ADD CONSTRAINT "product_allergen_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergen_overrides" ADD CONSTRAINT "product_allergen_overrides_allergen_code_allergens_catalog_code_fk" FOREIGN KEY ("allergen_code") REFERENCES "public"."allergens_catalog"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergen_overrides" ADD CONSTRAINT "product_allergen_overrides_added_by_employees_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_technical_sheets" ADD CONSTRAINT "product_technical_sheets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_technical_sheets" ADD CONSTRAINT "product_technical_sheets_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_guest_allergies" ADD CONSTRAINT "table_guest_allergies_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_guest_allergies" ADD CONSTRAINT "table_guest_allergies_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_guest_allergies" ADD CONSTRAINT "table_guest_allergies_allergen_code_allergens_catalog_code_fk" FOREIGN KEY ("allergen_code") REFERENCES "public"."allergens_catalog"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_guest_allergies" ADD CONSTRAINT "table_guest_allergies_registered_by_employees_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_record_id_time_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."time_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_imported_by_employees_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichaje_audit" ADD CONSTRAINT "fichaje_audit_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichaje_audit" ADD CONSTRAINT "fichaje_audit_performed_by_employees_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_record_id_time_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."time_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_corrected_by_employees_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifactu_audit_log" ADD CONSTRAINT "verifactu_audit_log_record_id_verifactu_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."verifactu_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifactu_audit_log" ADD CONSTRAINT "verifactu_audit_log_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifactu_records" ADD CONSTRAINT "verifactu_records_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifactu_records" ADD CONSTRAINT "verifactu_records_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_campaign_sends" ADD CONSTRAINT "crm_campaign_sends_campaign_id_crm_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."crm_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_campaign_sends" ADD CONSTRAINT "crm_campaign_sends_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_promotion_id_crm_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."crm_promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_consents" ADD CONSTRAINT "crm_consents_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_coupon_uses" ADD CONSTRAINT "crm_coupon_uses_promotion_id_crm_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."crm_promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_coupon_uses" ADD CONSTRAINT "crm_coupon_uses_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_gift_card_transactions" ADD CONSTRAINT "crm_gift_card_transactions_gift_card_id_crm_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."crm_gift_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_gift_card_transactions" ADD CONSTRAINT "crm_gift_card_transactions_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_gift_cards" ADD CONSTRAINT "crm_gift_cards_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_gift_cards" ADD CONSTRAINT "crm_gift_cards_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loyalty_points" ADD CONSTRAINT "crm_loyalty_points_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loyalty_points" ADD CONSTRAINT "crm_loyalty_points_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_wallet" ADD CONSTRAINT "crm_wallet_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_wallet_transactions" ADD CONSTRAINT "crm_wallet_transactions_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_wallet_transactions" ADD CONSTRAINT "crm_wallet_transactions_empleado_id_employees_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_queue" ADD CONSTRAINT "print_queue_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_employee_external_ids" ADD CONSTRAINT "hr_employee_external_ids_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_employee_positions" ADD CONSTRAINT "hr_employee_positions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_employee_positions" ADD CONSTRAINT "hr_employee_positions_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_employee_requests" ADD CONSTRAINT "hr_employee_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_employee_requests" ADD CONSTRAINT "hr_employee_requests_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_history" ADD CONSTRAINT "hr_import_history_template_id_hr_import_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."hr_import_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_history" ADD CONSTRAINT "hr_import_history_imported_by_employees_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_history" ADD CONSTRAINT "hr_import_history_reverted_by_employees_id_fk" FOREIGN KEY ("reverted_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_rows" ADD CONSTRAINT "hr_import_rows_import_id_hr_import_history_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."hr_import_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_rows" ADD CONSTRAINT "hr_import_rows_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_rows" ADD CONSTRAINT "hr_import_rows_time_record_id_time_records_id_fk" FOREIGN KEY ("time_record_id") REFERENCES "public"."time_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_import_templates" ADD CONSTRAINT "hr_import_templates_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_notifications" ADD CONSTRAINT "hr_notifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_pay_periods" ADD CONSTRAINT "hr_pay_periods_closed_by_employees_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_pay_periods" ADD CONSTRAINT "hr_pay_periods_reopened_by_employees_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_department_id_hr_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_alerts" ADD CONSTRAINT "director_alerts_assigned_to_employees_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_alerts" ADD CONSTRAINT "director_alerts_resolved_by_employees_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_costs" ADD CONSTRAINT "director_costs_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_custom_reports" ADD CONSTRAINT "director_custom_reports_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_goals" ADD CONSTRAINT "director_goals_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_audit_log" ADD CONSTRAINT "backup_audit_log_backup_id_backup_records_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."backup_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_audit_log" ADD CONSTRAINT "backup_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_audit_log" ADD CONSTRAINT "device_audit_log_device_id_offline_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."offline_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_audit_log" ADD CONSTRAINT "device_audit_log_performed_by_employees_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_devices" ADD CONSTRAINT "offline_devices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_devices" ADD CONSTRAINT "offline_devices_assigned_zone_id_room_zones_id_fk" FOREIGN KEY ("assigned_zone_id") REFERENCES "public"."room_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_devices" ADD CONSTRAINT "offline_devices_default_printer_id_printers_id_fk" FOREIGN KEY ("default_printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_devices" ADD CONSTRAINT "offline_devices_usuario_habitual_employees_id_fk" FOREIGN KEY ("usuario_habitual") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_queue" ADD CONSTRAINT "offline_queue_device_id_offline_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."offline_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_queue" ADD CONSTRAINT "offline_queue_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_events" ADD CONSTRAINT "tech_events_device_id_offline_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."offline_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_audit_log" ADD CONSTRAINT "setup_audit_log_session_id_setup_wizard_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."setup_wizard_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_audit_log" ADD CONSTRAINT "setup_audit_log_performed_by_employees_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_wizard_sessions" ADD CONSTRAINT "setup_wizard_sessions_started_by_employees_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_devices" ADD CONSTRAINT "installation_devices_default_printer_id_printers_id_fk" FOREIGN KEY ("default_printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuals" ADD CONSTRAINT "manuals_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" USING btree ("reference") WHERE "payments"."reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoice_extracted_lines_doc_idx" ON "invoice_extracted_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "invoice_extracted_lines_ingredient_idx" ON "invoice_extracted_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "invoice_product_mappings_supplier_idx" ON "invoice_product_mappings" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoice_product_mappings_text_idx" ON "invoice_product_mappings" USING btree ("supplier_id","supplier_text");--> statement-breakpoint
CREATE INDEX "invoice_scan_audit_doc_idx" ON "invoice_scan_audit_log" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "scanned_invoice_documents_status_idx" ON "scanned_invoice_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scanned_invoice_documents_hash_idx" ON "scanned_invoice_documents" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "scanned_invoice_documents_supplier_idx" ON "scanned_invoice_documents" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "director_alerts_status_idx" ON "director_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "director_alerts_priority_idx" ON "director_alerts" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "director_alerts_created_idx" ON "director_alerts" USING btree ("created_at");