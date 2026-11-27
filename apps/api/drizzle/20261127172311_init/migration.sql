CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"host_id" uuid NOT NULL,
	"organization_id" uuid,
	"kind" text DEFAULT 'event' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"capacity" integer NOT NULL,
	"price_rub" integer DEFAULT 0 NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"partner_badge" text,
	"seed_key" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_kind_check" CHECK ("kind" in ('event', 'invite')),
	CONSTRAINT "activities_title_check" CHECK (char_length(trim("title")) between 5 and 80),
	CONSTRAINT "activities_description_check" CHECK (char_length(trim("description")) between 15 and 1500),
	CONSTRAINT "activities_category_check" CHECK ("category" in ('Учёба', 'Карьера', 'Спорт', 'Общение', 'Творчество')),
	CONSTRAINT "activities_location_check" CHECK (char_length(trim("location")) between 3 and 120),
	CONSTRAINT "activities_capacity_check" CHECK ("capacity" between 2 and 100),
	CONSTRAINT "activities_price_rub_check" CHECK ("price_rub" between 0 and 1000000),
	CONSTRAINT "activities_coordinates_check" CHECK (("latitude" is null and "longitude" is null) or ("latitude" is not null and "longitude" is not null and "latitude" between -90 and 90 and "longitude" between -180 and 180)),
	CONSTRAINT "activities_partner_badge_check" CHECK ("partner_badge" in ('Встреча с командой', 'Стажировка', 'Экскурсия', 'Мастер-класс'))
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"user_id" uuid PRIMARY KEY,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"token_hash" bytea PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tokens_purpose_check" CHECK ("purpose" in ('verify_email'))
);
--> statement-breakpoint
CREATE TABLE "exclusions" (
	"activity_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exclusions_pkey" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"faculty" text,
	"group_name" text,
	CONSTRAINT "groups_pkey" PRIMARY KEY("faculty","group_name")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"activity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_check" CHECK (char_length(trim("body")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"seed_key" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_check" CHECK (char_length(trim("name")) between 2 and 80),
	CONSTRAINT "organizations_description_check" CHECK (char_length("description") <= 500)
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"activity_id" uuid,
	"user_id" uuid,
	"is_cohost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_pkey" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "partner_codes" (
	"code_hash" bytea PRIMARY KEY,
	"issued_by" uuid,
	"used_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"activity_id" uuid,
	"position" smallint,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_activity_position_key" UNIQUE("activity_id","position"),
	CONSTRAINT "photos_position_check" CHECK ("position" between 0 and 4),
	CONSTRAINT "photos_attached_check" CHECK (("activity_id" is null) = ("position" is null)),
	CONSTRAINT "photos_size_bytes_check" CHECK ("size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY,
	"account_kind" text DEFAULT 'student' NOT NULL,
	"name" text NOT NULL,
	"faculty" text DEFAULT '' NOT NULL,
	"course" text DEFAULT '' NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"theme" text DEFAULT 'violet' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"company_about" text DEFAULT '' NOT NULL,
	"seed_key" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_account_kind_check" CHECK ("account_kind" in ('student', 'partner')),
	CONSTRAINT "profiles_name_check" CHECK (char_length(trim("name")) between 1 and 40),
	CONSTRAINT "profiles_faculty_check" CHECK (char_length("faculty") <= 80),
	CONSTRAINT "profiles_course_check" CHECK ("course" in ('', '1', '2', '3', '4', '5', '6')),
	CONSTRAINT "profiles_group_name_check" CHECK (char_length("group_name") <= 20),
	CONSTRAINT "profiles_bio_check" CHECK (char_length("bio") <= 300),
	CONSTRAINT "profiles_interests_check" CHECK ("interests" <@ array['Учёба', 'Карьера', 'Спорт', 'Общение', 'Творчество']::text[]),
	CONSTRAINT "profiles_theme_check" CHECK ("theme" in ('violet', 'forest', 'light')),
	CONSTRAINT "profiles_company_check" CHECK (char_length("company") <= 80),
	CONSTRAINT "profiles_company_about_check" CHECK (char_length("company_about") <= 400),
	CONSTRAINT "profiles_partner_check" CHECK ("account_kind" <> 'partner' or (char_length(trim("company")) > 0 and "faculty" = '' and "course" = '' and "group_name" = ''))
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved" (
	"activity_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_pkey" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_check" CHECK ("email" = lower(trim("email")) and "email" <> '')
);
--> statement-breakpoint
CREATE INDEX "activities_feed_idx" ON "activities" ("created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "activities_host_idx" ON "activities" ("host_id");--> statement-breakpoint
CREATE INDEX "activities_organization_idx" ON "activities" ("organization_id");--> statement-breakpoint
CREATE INDEX "activities_starts_at_idx" ON "activities" ("starts_at");--> statement-breakpoint
CREATE INDEX "email_tokens_user_recent_idx" ON "email_tokens" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exclusions_user_idx" ON "exclusions" ("user_id");--> statement-breakpoint
CREATE INDEX "messages_room_recent_idx" ON "messages" ("activity_id","sent_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" ("owner_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "participants" ("user_id");--> statement-breakpoint
CREATE INDEX "photos_unattached_idx" ON "photos" ("created_at") WHERE "activity_id" is null;--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "saved_user_idx" ON "saved" ("user_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_host_id_profiles_id_fkey" FOREIGN KEY ("host_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_profiles_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_profiles_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_codes" ADD CONSTRAINT "partner_codes_issued_by_users_id_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_codes" ADD CONSTRAINT "partner_codes_used_by_users_id_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_id_profiles_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved" ADD CONSTRAINT "saved_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved" ADD CONSTRAINT "saved_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;