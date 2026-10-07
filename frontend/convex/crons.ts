import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Every Sunday 06:00 UTC: notify owners + accountants about customers with overdue debts.
crons.weekly("weekly debt digest", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 0 }, internal.extra.weeklyDebtDigestAll);

export default crons;
