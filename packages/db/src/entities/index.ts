import crypto from "node:crypto";
import {
  Check,
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  OneToOne,
  Opt,
  PrimaryKey,
  PrimaryKeyProp,
  Property,
  Rel,
  Unique,
} from "@mikro-orm/core";
import {
  BlankoState,
  ChannelSource,
  LocationCategory,
  NetworkState,
  NotifType,
  OfficerState,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
  ValidationState,
} from "@cekdulu/shared";
import { NumericFloatType } from "../types/NumericFloatType";

@Entity({ tableName: "users" })
export class User {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @Property({
    fieldName: "phone_number",
    type: "string",
    length: 20,
    unique: true,
  })
  phoneNumber!: string;

  @Property({
    fieldName: "full_name",
    type: "string",
    length: 100,
    nullable: true,
  })
  fullName?: string | null;

  @Enum({
    items: () => UserRole,
    nativeEnumName: "user_role",
    default: UserRole.WARGA,
  })
  role: UserRole & Opt = UserRole.WARGA;

  @Property({ fieldName: "is_verified", type: "boolean", default: false })
  isVerified: boolean & Opt = false;

  @Property({ fieldName: "wa_notif_enabled", type: "boolean", default: true })
  waNotifEnabled: boolean & Opt = true;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();

  @Property({
    fieldName: "updated_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
    onUpdate: () => new Date(),
  })
  updatedAt: Date & Opt = new Date();

  @OneToOne(() => UserReputation, (rep) => rep.user)
  reputation?: Rel<UserReputation>;
}

@Entity({ tableName: "otp_verifications" })
@Check({ expression: "attempts <= 5" })
@Index({
  name: "idx_otp_phone_expires",
  expression:
    "CREATE INDEX idx_otp_phone_expires ON otp_verifications (phone_number, expires_at) WHERE is_used = FALSE",
})
export class OtpVerification {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @Property({ fieldName: "phone_number", type: "string", length: 20 })
  phoneNumber!: string;

  @Property({ fieldName: "otp_hash", type: "string", length: 255 })
  otpHash!: string;

  @Property({ type: "int", default: 0 })
  attempts: number & Opt = 0;

  @Property({
    fieldName: "expires_at",
    type: "timestamptz",
    columnType: "timestamptz",
  })
  expiresAt!: Date;

  @Property({ fieldName: "is_used", type: "boolean", default: false })
  isUsed: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();
}

@Entity({ tableName: "user_reputations" })
export class UserReputation {
  @OneToOne(() => User, (u) => u.reputation, {
    primary: true,
    owner: true,
    fieldName: "user_id",
    deleteRule: "cascade",
  })
  user!: Rel<User>;

  [PrimaryKeyProp]?: "user";

  @Property({ fieldName: "total_reports", type: "int", default: 0 })
  totalReports: number & Opt = 0;

  @Property({ fieldName: "matched_reports", type: "int", default: 0 })
  matchedReports: number & Opt = 0;

  @Property({
    fieldName: "is_trusted_reporter",
    type: "boolean",
    default: false,
  })
  isTrustedReporter: boolean & Opt = false;

  @Property({ fieldName: "vote_weight", type: "int", default: 1 })
  voteWeight: number & Opt = 1;

  @Property({
    fieldName: "updated_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
    onUpdate: () => new Date(),
  })
  updatedAt: Date & Opt = new Date();
}

@Entity({ tableName: "locations" })
@Index({ name: "idx_locations_coords", properties: ["latitude", "longitude"] })
export class Location {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @Property({ type: "string", length: 150 })
  name!: string;

  @Enum({
    items: () => LocationCategory,
    nativeEnumName: "location_category",
  })
  category!: LocationCategory;

  @Property({ type: "text", columnType: "text", nullable: true })
  address?: string | null;

  @Property({ type: NumericFloatType, precision: 10, scale: 8 })
  latitude!: number;

  @Property({ type: NumericFloatType, precision: 11, scale: 8 })
  longitude!: number;

  @Property({
    fieldName: "open_time",
    type: "time",
    columnType: "time",
    nullable: true,
  })
  openTime?: string | null;

  @Property({
    fieldName: "close_time",
    type: "time",
    columnType: "time",
    nullable: true,
  })
  closeTime?: string | null;

  @Property({
    fieldName: "operational_days",
    type: "string",
    length: 50,
    nullable: true,
  })
  operationalDays?: string | null;

  @Property({ fieldName: "is_mobile_unit", type: "boolean", default: false })
  isMobileUnit: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();

  @OneToOne(() => LocationStatusSummary, (s) => s.location)
  statusSummary?: Rel<LocationStatusSummary>;

  @OneToMany(() => LocationRequirement, (req) => req.location)
  requirements = new Collection<LocationRequirement>(this);

  @OneToMany(() => RtSchedule, (sch) => sch.location)
  schedules = new Collection<RtSchedule>(this);

  @OneToMany(() => Report, (rep) => rep.location)
  reports = new Collection<Report>(this);

  @OneToMany(() => Question, (q) => q.location)
  questions = new Collection<Question>(this);
}

@Entity({ tableName: "location_status_summaries" })
export class LocationStatusSummary {
  @OneToOne(() => Location, (l) => l.statusSummary, {
    primary: true,
    owner: true,
    fieldName: "location_id",
    deleteRule: "cascade",
  })
  location!: Rel<Location>;

  [PrimaryKeyProp]?: "location";

  @Enum({
    fieldName: "current_status",
    items: () => SummaryStatus,
    nativeEnumName: "summary_status",
    default: SummaryStatus.UNKNOWN,
  })
  currentStatus: SummaryStatus & Opt = SummaryStatus.UNKNOWN;

  @Enum({
    fieldName: "blanko_status",
    items: () => BlankoState,
    nativeEnumName: "blanko_state",
    nullable: true,
  })
  blankoStatus?: BlankoState | null;

  @Enum({
    fieldName: "queue_estimate",
    items: () => QueueBucket,
    nativeEnumName: "queue_bucket",
    nullable: true,
  })
  queueEstimate?: QueueBucket | null;

  @Enum({
    fieldName: "officer_status",
    items: () => OfficerState,
    nativeEnumName: "officer_state",
    nullable: true,
  })
  officerStatus?: OfficerState | null;

  @Enum({
    fieldName: "network_status",
    items: () => NetworkState,
    nativeEnumName: "network_state",
    nullable: true,
  })
  networkStatus?: NetworkState | null;

  @Property({ fieldName: "confirmation_count", type: "int", default: 0 })
  confirmationCount: number & Opt = 0;

  @Property({
    fieldName: "last_updated_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
    onUpdate: () => new Date(),
  })
  lastUpdatedAt: Date & Opt = new Date();

  @Property({
    fieldName: "expires_at",
    type: "timestamptz",
    columnType: "timestamptz",
    nullable: true,
  })
  expiresAt?: Date | null;
}

@Entity({ tableName: "reports" })
@Index({
  name: "idx_reports_location_expires",
  expression:
    "CREATE INDEX idx_reports_location_expires ON reports (location_id, expires_at) WHERE is_hidden = FALSE",
})
@Index({
  name: "idx_reports_user_location_created",
  expression:
    "CREATE INDEX idx_reports_user_location_created ON reports (user_id, location_id, created_at DESC)",
})
export class Report {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => User, { fieldName: "user_id", deleteRule: "cascade" })
  user!: Rel<User>;

  @ManyToOne(() => Location, { fieldName: "location_id", deleteRule: "cascade" })
  location!: Rel<Location>;

  @Enum({
    fieldName: "condition_type",
    items: () => ReportCondition,
    nativeEnumName: "report_condition",
  })
  conditionType!: ReportCondition;

  @Enum({
    fieldName: "queue_range",
    items: () => QueueBucket,
    nativeEnumName: "queue_bucket",
    nullable: true,
  })
  queueRange?: QueueBucket | null;

  @Property({ type: "text", columnType: "text", nullable: true })
  notes?: string | null;

  @Enum({
    fieldName: "source_channel",
    items: () => ChannelSource,
    nativeEnumName: "channel_source",
    default: ChannelSource.WEB,
  })
  sourceChannel: ChannelSource & Opt = ChannelSource.WEB;

  @Enum({
    fieldName: "validation_status",
    items: () => ValidationState,
    nativeEnumName: "validation_state",
    default: ValidationState.PENDING,
  })
  validationStatus: ValidationState & Opt = ValidationState.PENDING;

  @Property({ fieldName: "weight_score", type: "int", default: 1 })
  weightScore: number & Opt = 1;

  @Property({ fieldName: "is_hidden", type: "boolean", default: false })
  isHidden: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();

  @Property({
    fieldName: "expires_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "(NOW() + INTERVAL '2 hours')",
  })
  expiresAt: Date & Opt = new Date(Date.now() + 2 * 60 * 60 * 1000);
}

@Entity({ tableName: "rt_officials" })
@Unique({
  name: "uq_rt_official_user_location",
  properties: ["user", "location"],
})
export class RtOfficial {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => User, { fieldName: "user_id", deleteRule: "cascade" })
  user!: Rel<User>;

  @ManyToOne(() => Location, { fieldName: "location_id", deleteRule: "cascade" })
  location!: Rel<Location>;

  @Property({ fieldName: "rt_rw_code", type: "string", length: 30 })
  rtRwCode!: string;

  @Property({ fieldName: "is_active", type: "boolean", default: true })
  isActive: boolean & Opt = true;
}

@Entity({ tableName: "rt_schedules" })
@Index({
  name: "idx_rt_schedules_location_date",
  properties: ["location", "scheduleDate"],
})
export class RtSchedule {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => Location, { fieldName: "location_id", deleteRule: "cascade" })
  location!: Rel<Location>;

  @ManyToOne(() => User, {
    fieldName: "created_by",
    nullable: true,
    deleteRule: "set null",
  })
  createdBy?: Rel<User> | null;

  @Property({
    fieldName: "schedule_date",
    type: "date",
    columnType: "date",
    defaultRaw: "CURRENT_DATE",
  })
  scheduleDate: string & Opt = new Date().toISOString().slice(0, 10);

  @Property({ fieldName: "start_time", type: "time", columnType: "time" })
  startTime!: string;

  @Property({ fieldName: "end_time", type: "time", columnType: "time" })
  endTime!: string;

  @Property({ fieldName: "is_available", type: "boolean", default: true })
  isAvailable: boolean & Opt = true;

  @Enum({
    fieldName: "source_channel",
    items: () => ChannelSource,
    nativeEnumName: "channel_source",
    default: ChannelSource.WEB,
  })
  sourceChannel: ChannelSource & Opt = ChannelSource.WEB;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();
}

export interface RequirementChecklistItem {
  label: string;
  required?: boolean;
  notes?: string;
}

@Entity({ tableName: "location_requirements" })
export class LocationRequirement {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => Location, { fieldName: "location_id", deleteRule: "cascade" })
  location!: Rel<Location>;

  @Property({ fieldName: "service_name", type: "string", length: 100 })
  serviceName!: string;

  @Property({ fieldName: "checklist_items", columnType: "jsonb", type: "json" })
  checklistItems!: Array<RequirementChecklistItem | string>;

  @ManyToOne(() => User, {
    fieldName: "updated_by",
    nullable: true,
    deleteRule: "set null",
  })
  updatedBy?: Rel<User> | null;

  @Property({
    fieldName: "updated_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
    onUpdate: () => new Date(),
  })
  updatedAt: Date & Opt = new Date();
}

@Entity({ tableName: "questions" })
@Index({
  name: "idx_questions_location",
  expression:
    "CREATE INDEX idx_questions_location ON questions (location_id, created_at DESC)",
})
export class Question {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => Location, { fieldName: "location_id", deleteRule: "cascade" })
  location!: Rel<Location>;

  @ManyToOne(() => User, { fieldName: "user_id", deleteRule: "cascade" })
  user!: Rel<User>;

  @Property({ fieldName: "question_text", type: "text", columnType: "text" })
  questionText!: string;

  @Property({ fieldName: "is_answered", type: "boolean", default: false })
  isAnswered: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();

  @OneToMany(() => Answer, (ans) => ans.question)
  answers = new Collection<Answer>(this);
}

@Entity({ tableName: "answers" })
export class Answer {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => Question, { fieldName: "question_id", deleteRule: "cascade" })
  question!: Rel<Question>;

  @ManyToOne(() => User, { fieldName: "user_id", deleteRule: "cascade" })
  user!: Rel<User>;

  @Property({ fieldName: "answer_text", type: "text", columnType: "text" })
  answerText!: string;

  @Property({ fieldName: "is_official_rt", type: "boolean", default: false })
  isOfficialRt: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();
}

@Entity({ tableName: "watched_locations" })
export class WatchedLocation {
  @ManyToOne(() => User, {
    primary: true,
    fieldName: "user_id",
    deleteRule: "cascade",
  })
  user!: Rel<User>;

  @ManyToOne(() => Location, {
    primary: true,
    fieldName: "location_id",
    deleteRule: "cascade",
  })
  location!: Rel<Location>;

  [PrimaryKeyProp]?: ["user", "location"];

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();
}

@Entity({ tableName: "notifications" })
@Index({
  name: "idx_notifications_user_unread",
  properties: ["user", "isRead"],
})
export class Notification {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id: string & Opt = crypto.randomUUID();

  @ManyToOne(() => User, { fieldName: "user_id", deleteRule: "cascade" })
  user!: Rel<User>;

  @Enum({
    items: () => NotifType,
    nativeEnumName: "notif_type",
  })
  type!: NotifType;

  @Property({ type: "string", length: 150 })
  title!: string;

  @Property({ type: "text", columnType: "text" })
  body!: string;

  @Property({ fieldName: "reference_id", type: "uuid", nullable: true })
  referenceId?: string | null;

  @Property({ fieldName: "is_read", type: "boolean", default: false })
  isRead: boolean & Opt = false;

  @Property({ fieldName: "sent_via_wa", type: "boolean", default: false })
  sentViaWa: boolean & Opt = false;

  @Property({
    fieldName: "created_at",
    type: "timestamptz",
    columnType: "timestamptz",
    defaultRaw: "NOW()",
  })
  createdAt: Date & Opt = new Date();
}

export const ALL_ENTITIES = [
  User,
  OtpVerification,
  UserReputation,
  Location,
  LocationStatusSummary,
  Report,
  RtOfficial,
  RtSchedule,
  LocationRequirement,
  Question,
  Answer,
  WatchedLocation,
  Notification,
];
