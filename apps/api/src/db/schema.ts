import { pgTable, unique, uuid, text, timestamp, boolean, index, foreignKey, inet, serial, check, integer, smallint, vector, bigint, jsonb, uniqueIndex, bigserial, real, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { citext } from "./citext";

export const notificationChannel = pgEnum("notification_channel", ['in_app', 'telegram', 'email'])
export const postStatus = pgEnum("post_status", ['published', 'pending_review', 'hidden', 'removed'])
export const reportStatus = pgEnum("report_status", ['open', 'reviewed', 'dismissed', 'actioned'])
export const requestStatus = pgEnum("request_status", ['pending', 'accepted', 'declined', 'cancelled', 'completed'])
export const riskLevel = pgEnum("risk_level", ['none', 'low', 'medium', 'high'])
export const roadmapStatus = pgEnum("roadmap_status", ['active', 'completed', 'archived'])
export const sessionStatus = pgEnum("session_status", ['scheduled', 'completed', 'cancelled', 'no_show'])
export const stepStatus = pgEnum("step_status", ['todo', 'in_progress', 'done', 'skipped'])
export const userRole = pgEnum("user_role", ['student', 'mentor', 'admin'])


export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// TODO: failed to parse database type 'citext'
	email: citext("email").notNull(),
	passwordHash: text("password_hash").notNull(),
	role: userRole().default('student').notNull(),
	emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_key").on(table.email),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	userAgent: text("user_agent"),
	ipAddress: inet("ip_address"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_refresh_tokens_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_fkey"
		}).onDelete("cascade"),
	unique("refresh_tokens_token_hash_key").on(table.tokenHash),
]);

export const skills = pgTable("skills", {
	id: serial().primaryKey().notNull(),
	// TODO: failed to parse database type 'citext'
	name: citext("name").notNull(),
	category: text(),
}, (table) => [
	unique("skills_name_key").on(table.name),
]);

export const careers = pgTable("careers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	description: text().notNull(),
	salaryMinUsd: integer("salary_min_usd"),
	salaryMaxUsd: integer("salary_max_usd"),
	demandLevel: smallint("demand_level"),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isPublished: boolean("is_published").default(true).notNull(),
}, (table) => [
	index("idx_careers_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	unique("careers_slug_key").on(table.slug),
	check("careers_demand_level_check", sql`(demand_level >= 1) AND (demand_level <= 5)`),
]);

export const profiles = pgTable("profiles", {
	userId: uuid("user_id").primaryKey().notNull(),
	fullName: text("full_name").notNull(),
	avatarUrl: text("avatar_url"),
	province: text(),
	birthYear: smallint("birth_year"),
	educationLevel: text("education_level"),
	bio: text(),
	interests: text().array().default([""]).notNull(),
	preferredLang: text("preferred_lang").default('en').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "profiles_user_id_fkey"
		}).onDelete("cascade"),
	unique("profiles_telegram_chat_id_key").on(table.telegramChatId),
	check("profiles_birth_year_check", sql`(birth_year >= 1950) AND (birth_year <= 2030)`),
	check("profiles_preferred_lang_check", sql`preferred_lang = ANY (ARRAY['en'::text, 'km'::text])`),
]);

export const telegramLinkCodes = pgTable("telegram_link_codes", {
	code: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "telegram_link_codes_user_id_fkey"
		}).onDelete("cascade"),
]);

export const mentorProfiles = pgTable("mentor_profiles", {
	userId: uuid("user_id").primaryKey().notNull(),
	headline: text().notNull(),
	company: text(),
	yearsExperience: smallint("years_experience"),
	expertise: text().array().default([""]).notNull(),
	availability: jsonb().default({}).notNull(),
	isVerified: boolean("is_verified").default(false).notNull(),
	isAccepting: boolean("is_accepting").default(true).notNull(),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mentor_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_mentor_expertise").using("gin", table.expertise.asc().nullsLast().op("array_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mentor_profiles_user_id_fkey"
		}).onDelete("cascade"),
	check("mentor_profiles_years_experience_check", sql`years_experience >= 0`),
]);

export const mentorshipRequests = pgTable("mentorship_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	menteeId: uuid("mentee_id").notNull(),
	mentorId: uuid("mentor_id").notNull(),
	message: text().notNull(),
	status: requestStatus().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_requests_mentee").using("btree", table.menteeId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("idx_requests_mentor").using("btree", table.mentorId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	uniqueIndex("uq_open_request").using("btree", table.menteeId.asc().nullsLast().op("uuid_ops"), table.mentorId.asc().nullsLast().op("uuid_ops")).where(sql`(status = ANY (ARRAY['pending'::request_status, 'accepted'::request_status]))`),
	foreignKey({
			columns: [table.menteeId],
			foreignColumns: [users.id],
			name: "mentorship_requests_mentee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.mentorId],
			foreignColumns: [mentorProfiles.userId],
			name: "mentorship_requests_mentor_id_fkey"
		}).onDelete("cascade"),
	check("mentorship_requests_check", sql`mentee_id <> mentor_id`),
]);

export const roadmaps = pgTable("roadmaps", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	careerId: uuid("career_id"),
	title: text().notNull(),
	goal: text().notNull(),
	status: roadmapStatus().default('active').notNull(),
	aiModel: text("ai_model").notNull(),
	rawResponse: jsonb("raw_response"),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	hoursPerWeek: smallint("hours_per_week"),
	promptVersion: text("prompt_version"),
}, (table) => [
	index("idx_roadmaps_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_roadmaps_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.careerId],
			foreignColumns: [careers.id],
			name: "roadmaps_career_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "roadmaps_user_id_fkey"
		}).onDelete("cascade"),
	check("roadmaps_hours_per_week_check", sql`(hours_per_week >= 1) AND (hours_per_week <= 80)`),
]);

export const assessments = pgTable("assessments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	answers: jsonb().notNull(),
	summary: text(),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_assessments_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "assessments_user_id_fkey"
		}).onDelete("cascade"),
]);

export const roadmapSteps = pgTable("roadmap_steps", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	roadmapId: uuid("roadmap_id").notNull(),
	position: integer().notNull(),
	title: text().notNull(),
	description: text(),
	resourceUrl: text("resource_url"),
	estWeeks: smallint("est_weeks"),
	status: stepStatus().default('todo').notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.roadmapId],
			foreignColumns: [roadmaps.id],
			name: "roadmap_steps_roadmap_id_fkey"
		}).onDelete("cascade"),
	unique("roadmap_steps_roadmap_id_position_key").on(table.roadmapId, table.position),
]);

export const mentorshipSessions = pgTable("mentorship_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }).notNull(),
	durationMin: smallint("duration_min").default(30).notNull(),
	meetingUrl: text("meeting_url"),
	status: sessionStatus().default('scheduled').notNull(),
	notes: text(),
}, (table) => [
	index("idx_sessions_request").using("btree", table.requestId.asc().nullsLast().op("timestamptz_ops"), table.scheduledAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [mentorshipRequests.id],
			name: "mentorship_sessions_request_id_fkey"
		}).onDelete("cascade"),
]);

export const chatMessages = pgTable("chat_messages", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	senderId: uuid("sender_id").notNull(),
	body: text().notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_chat_room").using("btree", table.requestId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [mentorshipRequests.id],
			name: "chat_messages_request_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "chat_messages_sender_id_fkey"
		}).onDelete("cascade"),
	check("chat_messages_body_check", sql`length(body) <= 4000`),
]);

export const mentorReviews = pgTable("mentor_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	rating: smallint().notNull(),
	comment: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [mentorshipRequests.id],
			name: "mentor_reviews_request_id_fkey"
		}).onDelete("cascade"),
	unique("mentor_reviews_request_id_key").on(table.requestId),
	check("mentor_reviews_rating_check", sql`(rating >= 1) AND (rating <= 5)`),
]);

export const forumPostAnalysis = pgTable("forum_post_analysis", {
	postId: uuid("post_id").primaryKey().notNull(),
	sentiment: real(),
	topics: text().array().default([""]).notNull(),
	risk: riskLevel().default('none').notNull(),
	model: text().notNull(),
	analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
}, (table) => [
	index("idx_analysis_risk").using("btree", table.risk.asc().nullsLast().op("timestamptz_ops"), table.analyzedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((risk = ANY (ARRAY['medium'::risk_level, 'high'::risk_level])) AND (reviewed_at IS NULL))`),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [forumPosts.id],
			name: "forum_post_analysis_post_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "forum_post_analysis_reviewed_by_fkey"
		}).onDelete("set null"),
	check("forum_post_analysis_sentiment_check", sql`(sentiment >= ('-1'::integer)::double precision) AND (sentiment <= (1)::double precision)`),
]);

export const forumCategories = pgTable("forum_categories", {
	id: serial().primaryKey().notNull(),
	slug: text().notNull(),
	name: text().notNull(),
}, (table) => [
	unique("forum_categories_slug_key").on(table.slug),
]);

export const forumPosts = pgTable("forum_posts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	authorId: uuid("author_id").notNull(),
	categoryId: integer("category_id").notNull(),
	title: text().notNull(),
	body: text().notNull(),
	isAnonymous: boolean("is_anonymous").default(true).notNull(),
	anonymousAlias: text("anonymous_alias"),
	status: postStatus().default('published').notNull(),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_posts_author").using("btree", table.authorId.asc().nullsLast().op("uuid_ops")),
	index("idx_posts_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_posts_feed").using("btree", table.categoryId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("int4_ops")).where(sql`(status = 'published'::post_status)`),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [users.id],
			name: "forum_posts_author_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [forumCategories.id],
			name: "forum_posts_category_id_fkey"
		}),
	check("forum_posts_body_check", sql`length(body) <= 10000`),
	check("forum_posts_title_check", sql`(length(title) >= 3) AND (length(title) <= 200)`),
]);

export const forumComments = pgTable("forum_comments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	postId: uuid("post_id").notNull(),
	authorId: uuid("author_id").notNull(),
	parentId: uuid("parent_id"),
	body: text().notNull(),
	isAnonymous: boolean("is_anonymous").default(true).notNull(),
	anonymousAlias: text("anonymous_alias"),
	status: postStatus().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_comments_post").using("btree", table.postId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [users.id],
			name: "forum_comments_author_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "forum_comments_parent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [forumPosts.id],
			name: "forum_comments_post_id_fkey"
		}).onDelete("cascade"),
	check("forum_comments_body_check", sql`length(body) <= 4000`),
]);

export const contentReports = pgTable("content_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reporterId: uuid("reporter_id").notNull(),
	postId: uuid("post_id"),
	commentId: uuid("comment_id"),
	reason: text().notNull(),
	status: reportStatus().default('open').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_reports_open").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'open'::report_status)`),
	foreignKey({
			columns: [table.commentId],
			foreignColumns: [forumComments.id],
			name: "content_reports_comment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [forumPosts.id],
			name: "content_reports_post_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reporterId],
			foreignColumns: [users.id],
			name: "content_reports_reporter_id_fkey"
		}).onDelete("cascade"),
	check("content_reports_check", sql`(post_id IS NOT NULL) <> (comment_id IS NOT NULL)`),
]);

export const wellnessCheckins = pgTable("wellness_checkins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	mood: smallint().notNull(),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_checkins_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "wellness_checkins_user_id_fkey"
		}).onDelete("cascade"),
	check("wellness_checkins_mood_check", sql`(mood >= 1) AND (mood <= 5)`),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	channel: notificationChannel().default('in_app').notNull(),
	type: text().notNull(),
	payload: jsonb().default({}).notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notifications_unread").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(read_at IS NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_fkey"
		}).onDelete("cascade"),
]);

export const aiUsageLogs = pgTable("ai_usage_logs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: uuid("user_id"),
	feature: text().notNull(),
	model: text().notNull(),
	promptTokens: integer("prompt_tokens").default(0).notNull(),
	completionTokens: integer("completion_tokens").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ai_usage_user_day").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ai_usage_logs_user_id_fkey"
		}).onDelete("set null"),
]);

export const auditLogs = pgTable("audit_logs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	actorId: uuid("actor_id"),
	action: text().notNull(),
	targetType: text("target_type").notNull(),
	targetId: text("target_id").notNull(),
	details: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_actor").using("btree", table.actorId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_audit_target").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [users.id],
			name: "audit_logs_actor_id_fkey"
		}).onDelete("set null"),
]);

export const userSkills = pgTable("user_skills", {
	userId: uuid("user_id").notNull(),
	skillId: integer("skill_id").notNull(),
	proficiency: smallint().default(1).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "user_skills_skill_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_skills_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.skillId], name: "user_skills_pkey"}),
	check("user_skills_proficiency_check", sql`(proficiency >= 1) AND (proficiency <= 5)`),
]);

export const careerSkills = pgTable("career_skills", {
	careerId: uuid("career_id").notNull(),
	skillId: integer("skill_id").notNull(),
	importance: smallint().default(3).notNull(),
}, (table) => [
	index("idx_career_skills_skill").using("btree", table.skillId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.careerId],
			foreignColumns: [careers.id],
			name: "career_skills_career_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "career_skills_skill_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.careerId, table.skillId], name: "career_skills_pkey"}),
	check("career_skills_importance_check", sql`(importance >= 1) AND (importance <= 5)`),
]);

export const forumReactions = pgTable("forum_reactions", {
	postId: uuid("post_id").notNull(),
	userId: uuid("user_id").notNull(),
	kind: text().default('support').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.postId],
			foreignColumns: [forumPosts.id],
			name: "forum_reactions_post_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "forum_reactions_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.postId, table.userId, table.kind], name: "forum_reactions_pkey"}),
	check("forum_reactions_kind_check", sql`kind = ANY (ARRAY['support'::text, 'helpful'::text, 'relate'::text])`),
]);
