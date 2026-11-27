import {
  accountKinds,
  activityKinds,
  categories,
  courses,
  partnerBadges,
  themeIds,
} from '@unicore/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  bytea,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// The database schema: docs/backend-architecture.md, section 6.
// The database keeps the rules visible in a single row (lengths, ranges, lists of values,
// uniqueness, foreign keys); rules that need other rows or the current user live in the services.
// After editing this file run `npm -w apps/api run db:generate` and commit the new migration.

// Lists of values come from @unicore/shared, the same ones the API schemas check. A change
// in a list, or in its order, changes a CHECK: db:generate then makes a new migration.
/** Categories of events and interests; 'Все' is only a filter in the app. */
const categoryValues = categories.filter((category) => category !== 'Все');
const emailTokenPurposeValues = ['verify_email'];

/**
 * A comma-separated list of SQL string literals. A CHECK can't take query parameters, so the
 * values are inlined; they are the constants above, never user input.
 */
function literals(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', '));
}

function oneOf(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} in (${literals(values)})`;
}

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('users_email_check', sql`${t.email} = lower(trim(${t.email})) and ${t.email} <> ''`),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All tokens of one sign-in share it; reuse of a spent token revokes the whole family. */
    familyId: uuid('family_id').notNull(),
    /** sha256 of the token; the token itself is never stored. */
    tokenHash: bytea('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    /** sha256 of the token from the email link. */
    tokenHash: bytea('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('email_tokens_purpose_check', oneOf(t.purpose, emailTokenPurposeValues)),
    // The latest email of a user: limits how often a confirmation is resent.
    index('email_tokens_user_recent_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export const admins = pgTable('admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partnerCodes = pgTable('partner_codes', {
  /** sha256 of lower(trim(code)); the code itself is shown once to the admin who issued it. */
  codeHash: bytea('code_hash').primaryKey(),
  issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountKind: text('account_kind').notNull().default('student'),
    name: text('name').notNull(),
    faculty: text('faculty').notNull().default(''),
    course: text('course').notNull().default(''),
    groupName: text('group_name').notNull().default(''),
    bio: text('bio').notNull().default(''),
    interests: text('interests')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    theme: text('theme').notNull().default('violet'),
    company: text('company').notNull().default(''),
    companyAbout: text('company_about').notNull().default(''),
    seedKey: text('seed_key').unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check('profiles_account_kind_check', oneOf(t.accountKind, accountKinds)),
    check('profiles_name_check', sql`char_length(trim(${t.name})) between 1 and 40`),
    check('profiles_faculty_check', sql`char_length(${t.faculty}) <= 80`),
    check('profiles_course_check', oneOf(t.course, courses)),
    check('profiles_group_name_check', sql`char_length(${t.groupName}) <= 20`),
    check('profiles_bio_check', sql`char_length(${t.bio}) <= 300`),
    check(
      'profiles_interests_check',
      sql`${t.interests} <@ array[${literals(categoryValues)}]::text[]`,
    ),
    check('profiles_theme_check', oneOf(t.theme, themeIds)),
    check('profiles_company_check', sql`char_length(${t.company}) <= 80`),
    check('profiles_company_about_check', sql`char_length(${t.companyAbout}) <= 400`),
    // A partner has a company and no institute, course or group.
    check(
      'profiles_partner_check',
      sql`${t.accountKind} <> 'partner' or (char_length(trim(${t.company})) > 0 and ${t.faculty} = '' and ${t.course} = '' and ${t.groupName} = '')`,
    ),
  ],
);

/** Institute and group pairs a profile may choose; the profile service checks the pair. */
export const groups = pgTable(
  'groups',
  {
    faculty: text('faculty').notNull(),
    groupName: text('group_name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.faculty, t.groupName] })],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    seedKey: text('seed_key').unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check('organizations_name_check', sql`char_length(trim(${t.name})) between 2 and 80`),
    check('organizations_description_check', sql`char_length(${t.description}) <= 500`),
    // The user's own organizations in the snapshot.
    index('organizations_owner_idx').on(t.ownerId),
  ],
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull().default('event'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    location: text('location').notNull(),
    capacity: integer('capacity').notNull(),
    priceRub: integer('price_rub').notNull().default(0),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    // No CHECK: the list lives in `eventTags` in @unicore/shared and the service checks it.
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    featured: boolean('featured').notNull().default(false),
    partnerBadge: text('partner_badge'),
    seedKey: text('seed_key').unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check('activities_kind_check', oneOf(t.kind, activityKinds)),
    check('activities_title_check', sql`char_length(trim(${t.title})) between 5 and 80`),
    check(
      'activities_description_check',
      sql`char_length(trim(${t.description})) between 15 and 1500`,
    ),
    check('activities_category_check', oneOf(t.category, categoryValues)),
    check('activities_location_check', sql`char_length(trim(${t.location})) between 3 and 120`),
    check('activities_capacity_check', sql`${t.capacity} between 2 and 100`),
    check('activities_price_rub_check', sql`${t.priceRub} between 0 and 1000000`),
    check(
      'activities_coordinates_check',
      // `is not null` is required: a CHECK that evaluates to NULL passes.
      sql`(${t.latitude} is null and ${t.longitude} is null) or (${t.latitude} is not null and ${t.longitude} is not null and ${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180)`,
    ),
    check('activities_partner_badge_check', oneOf(t.partnerBadge, partnerBadges)),
    // The feed: newest first.
    index('activities_feed_idx').on(t.createdAt.desc(), t.id),
    index('activities_host_idx').on(t.hostId),
    index('activities_organization_idx').on(t.organizationId),
    index('activities_starts_at_idx').on(t.startsAt),
  ],
);

/** Members of an activity. The host is never a row here: a student host takes one place implicitly. */
export const participants = pgTable(
  'participants',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    isCohost: boolean('is_cohost').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.userId] }),
    index('participants_user_idx').on(t.userId),
  ],
);

export const saved = pgTable(
  'saved',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.userId] }), index('saved_user_idx').on(t.userId)],
);

/** Users removed from an activity: they can't see it or join it again. */
export const exclusions = pgTable(
  'exclusions',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.userId] }),
    index('exclusions_user_idx').on(t.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('messages_body_check', sql`char_length(trim(${t.body})) between 1 and 1000`),
    // The latest 100 messages of a room.
    index('messages_room_recent_idx').on(t.activityId, t.sentAt.desc(), t.id.desc()),
  ],
);

/** Uploaded photos; the id is the file name. An activity holds up to 5, in `position` order. */
export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** null: uploaded but not attached yet. */
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'cascade' }),
    position: smallint('position'),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('photos_position_check', sql`${t.position} between 0 and 4`),
    check('photos_attached_check', sql`(${t.activityId} is null) = (${t.position} is null)`),
    check('photos_size_bytes_check', sql`${t.sizeBytes} > 0`),
    // Also serves lookups by activity.
    unique('photos_activity_position_key').on(t.activityId, t.position),
    // Cleanup of photos that were never attached.
    index('photos_unattached_idx')
      .on(t.createdAt)
      .where(sql`${t.activityId} is null`),
  ],
);
