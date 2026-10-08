import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Every Sunday 06:00 UTC: notify owners + accountants about customers with overdue debts.
crons.weekly("weekly debt digest", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 0 }, internal.extra.weeklyDebtDigestAll);

// Every day 18:00 UTC (21:00 Syria): SMS each owner today's sales, collections and new debts.
crons.daily("daily sms summary", { hourUTC: 18, minuteUTC: 0 }, internal.dailySms.sendAll);

export default crons;
