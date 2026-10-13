import {
  boolean,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { channelType, recordStatus } from "./enums";
import { companies, locations, users } from "./tenancy";

export const employees = pgTable(
  "employees",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // Primary location. Additional locations live in employee_locations.
    locationId: uuid("location_id").notNull().references(() => locations.id),
    // Optional login (employee self-service web access later).
    userId: uuid("user_id").references(() => users.id),
    // The manager (a user with role MANAGER) responsible for this employee.
    managerId: uuid("manager_id").references(() => users.id),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    department: text("department"),
    position: text("position"),
    preferredChannel: channelType("preferred_channel"),
    // Telegram username / WhatsApp number the employee will use; verified via link code.
    platformIdentifier: text("platform_identifier"),
    // Soft state only: employees with attendance history are never deleted.
    status: recordStatus("status").notNull().default("ACTIVE"),
    hiredOn: date("hired_on"),
    deactivatedOn: date("deactivated_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("employees_company_number_uq").on(t.companyId, t.employeeNumber),
    index("employees_company_location_idx").on(t.companyId, t.locationId, t.status),
    index("employees_company_name_idx").on(t.companyId, t.lastName, t.firstName),
    index("employees_manager_idx").on(t.managerId),
  ],
);

// Lets an employee work across several locations without schema changes.
export const employeeLocations = pgTable(
  "employee_locations",
  {
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.locationId] }),
    index("employee_locations_location_idx").on(t.locationId),
  ],
);

// A manager is a user assigned to one or more locations.
export const managers = pgTable(
  "managers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("managers_user_uq").on(t.userId)],
);

export const managerLocations = pgTable(
  "manager_locations",
  {
    managerId: uuid("manager_id").notNull().references(() => managers.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.managerId, t.locationId] }),
    index("manager_locations_location_idx").on(t.locationId),
  ],
);
