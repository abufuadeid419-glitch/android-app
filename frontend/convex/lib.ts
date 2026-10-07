import { QueryCtx, MutationCtx } from "./_generated/server";

// ---- id / time helpers (mirror server.py new_id / iso / gen_code) ----
export const nowIso = () => new Date().toISOString();
export const newId = () => (globalThis.crypto as Crypto).randomUUID().replace(/-/g, "");
export const genCode = (prefix = "") => {
  const seg = () => Math.random().toString(16).slice(2, 6).toUpperCase().padStart(4, "0");
  return prefix + [seg(), seg(), seg()].join("-");
};

// Strip Convex system fields so results match the old Mongo/JSON shape the app expects.
export function clean<T extends Record<string, any>>(doc: T | null): any {
  if (!doc) return doc;
  const { _id, _creationTime, ...rest } = doc as any;
  return rest;
}
export const cleanAll = (docs: any[]) => docs.map(clean);

// ---- auth (mirror server.py get_user / require) ----
export async function getUser(ctx: QueryCtx, token?: string) {
  if (!token) throw new Error("غير مصرح");
  const sess = await ctx.db
    .query("user_sessions")
    .withIndex("by_token", (q) => q.eq("session_token", token))
    .unique();
  if (!sess) throw new Error("الجلسة غير صالحة");
  const exp = sess.expires_at;
  const expMs = typeof exp === "number" ? exp : exp ? Date.parse(exp) : 0;
  if (expMs && expMs < Date.now()) throw new Error("انتهت الجلسة");
  const user = await ctx.db
    .query("users")
    .withIndex("by_user_id", (q) => q.eq("user_id", sess.user_id))
    .unique();
  if (!user) throw new Error("المستخدم غير موجود");
  return user;
}

export function roleKey(user: any): string | null {
  return user.role === "EMPLOYEE" ? user.employee_type ?? null : user.role ?? null;
}

export async function orgById(ctx: QueryCtx, org_id?: string | null) {
  if (!org_id) return null;
  return await ctx.db
    .query("organizations")
    .withIndex("by_biz_id", (q) => q.eq("id", org_id))
    .unique();
}

// Role gate equivalent to server.py require(*roles). Returns the user or throws.
export async function require(ctx: QueryCtx, token: string | undefined, roles: string[]) {
  const user = await getUser(ctx, token);
  const key = roleKey(user);
  if (!key || !roles.includes(key)) throw new Error("ليس لديك صلاحية");
  if (key !== "DEVELOPER") {
    const org = await orgById(ctx, user.org_id);
    if (!org || org.status !== "ACTIVE") throw new Error("اشتراك المؤسسة غير فعال");
    if (org.expires_at && Date.parse(org.expires_at) < Date.now()) throw new Error("انتهى اشتراك المؤسسة");
  }
  return user;
}

export const OWNER = ["OWNER"];
export const STAFF = ["OWNER", "ACCOUNTANT"];
export const AGENT = ["FIELD_AGENT"];
export const ANY_ORG = ["OWNER", "ACCOUNTANT", "FIELD_AGENT"];
export const DEV = ["DEVELOPER"];

export const isAgent = (user: any) => user.employee_type === "FIELD_AGENT";

// ---- counters (mirror next_no) ----
export async function nextNo(ctx: MutationCtx, org_id: string, kind: string, prefix: string) {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_org_kind", (q) => q.eq("org_id", org_id).eq("kind", kind))
    .unique();
  const n = (existing?.n ?? 0) + 1;
  if (existing) await ctx.db.patch(existing._id, { n });
  else await ctx.db.insert("counters", { org_id, kind, n });
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

// ---- stock movement log (mirror log_movement) ----
export async function logMovement(
  ctx: MutationCtx,
  org_id: string,
  product_id: string,
  product_name: string,
  type: string,
  qty: number,
  byName: string | null,
  byRole = "OWNER",
) {
  await ctx.db.insert("stock_movements", {
    org_id,
    product_id,
    product_name,
    type,
    qty,
    by: byName,
    by_role: byRole,
    at: nowIso(),
  });
}

// ---- lookups by business string id ----
export async function docById(ctx: QueryCtx, table: any, id: string) {
  return await ctx.db.query(table).withIndex("by_biz_id", (q: any) => q.eq("id", id)).unique();
}

// Document of a table scoped to the user's org (mirror find_one({id, org_id})).
export async function docOrgUnique(ctx: QueryCtx, table: any, id: string, org_id: string) {
  return await ctx.db
    .query(table)
    .withIndex("by_biz_id", (q: any) => q.eq("id", id))
    .filter((q: any) => q.eq(q.field("org_id"), org_id))
    .unique();
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- geo fields (mirror server.py geo(body)) ----
export const geoFields = (a: any) => ({
  lat: a.lat ?? null,
  lng: a.lng ?? null,
  client_created_at: a.client_created_at ?? null,
});

// ---- customer access (mirror org_customer): agents only reach their own ----
export async function orgCustomer(ctx: QueryCtx, user: any, cid: string) {
  const c = await docOrgUnique(ctx, "customers", cid, user.org_id);
  if (!c || (isAgent(user) && c.distributor_id !== user.user_id)) throw new Error("العميل غير موجود");
  return c;
}

// ---- price for a customer (mirror price_for): customer-type price list then product price ----
export async function priceFor(ctx: QueryCtx, org_id: string, cust: any, product_id: string): Promise<number> {
  if (cust?.type_id) {
    const t = await docOrgUnique(ctx, "customer_types", cust.type_id, org_id);
    const p = (t as any)?.prices?.[product_id];
    if (p !== undefined && p !== null) return Number(p);
  }
  const prod = await docOrgUnique(ctx, "products", product_id, org_id);
  return prod ? Number((prod as any).sale_price) : 0;
}

// ---- distributor inventory line for (distributor, product) ----
export async function distInv(ctx: QueryCtx, distributor_id: string, product_id: string) {
  return await ctx.db
    .query("distributor_inventory")
    .withIndex("by_dist_product", (q) => q.eq("distributor_id", distributor_id).eq("product_id", product_id))
    .unique();
}

export const sumBy = (rows: any[], field: string) => round2(rows.reduce((n, r) => n + (r[field] || 0), 0));

// ---- distributor inventory adjust (mirror $inc quantity with upsert) ----
export async function invAdjust(
  ctx: MutationCtx,
  org_id: string,
  distributor_id: string,
  product_id: string,
  product_name: string,
  inc: number,
) {
  const row = await distInv(ctx, distributor_id, product_id);
  if (row) await ctx.db.patch(row._id, { quantity: round2((row.quantity ?? 0) + inc), org_id, product_name });
  else await ctx.db.insert("distributor_inventory", { org_id, distributor_id, product_id, product_name, quantity: round2(inc) });
}

// ---- notifications (mirror notify) ----
export async function notify(ctx: MutationCtx, userIds: (string | null | undefined)[], ntype: string, title: string, body: string) {
  for (const u of userIds) {
    if (u) await ctx.db.insert("notifications", { id: newId(), user_id: u, type: ntype, title, body, read: false, created_at: nowIso() });
  }
}

export async function orgOwnerIds(ctx: QueryCtx, org_id: string) {
  const org = await orgById(ctx, org_id);
  return org?.owner_id ? [org.owner_id] : [];
}

// ---- low-stock owner alerts (mirror check_low_stock) ----
export async function checkLowStock(ctx: MutationCtx, org_id: string, productIds: string[]) {
  for (const pid of productIds) {
    const p = await docOrgUnique(ctx, "products", pid, org_id);
    if (p && (p.stock ?? 0) <= (p.min_stock ?? 0)) {
      const out = (p.stock ?? 0) <= 0;
      await notify(
        ctx,
        await orgOwnerIds(ctx, org_id),
        out ? "out_of_stock" : "low_stock",
        out ? "نفاد المخزون" : "مخزون منخفض",
        `${p.name}: المتبقي ${p.stock ?? 0} ${p.unit ?? ""}`,
      );
    }
  }
}
