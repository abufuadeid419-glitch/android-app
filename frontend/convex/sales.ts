import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  AGENT,
  ANY_ORG,
  clean,
  cleanAll,
  distInv,
  docOrgUnique,
  geoFields,
  isAgent,
  logMovement,
  newId,
  nextNo,
  nowIso,
  orgCustomer,
  priceFor,
  require,
  round2,
} from "./lib";

const lineItem = v.object({
  product_id: v.string(),
  quantity: v.number(),
  price: v.optional(v.number()),
});

// GET /api/sales  (ANY_ORG; agents see only their own, newest first)
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await require(ctx, token, ANY_ORG);
    const rows = isAgent(user)
      ? await ctx.db
          .query("sales")
          .withIndex("by_distributor", (q) => q.eq("distributor_id", user.user_id))
          .filter((q) => q.eq(q.field("org_id"), user.org_id!))
          .collect()
      : await ctx.db.query("sales").withIndex("by_org", (q) => q.eq("org_id", user.org_id!)).collect();
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return cleanAll(rows);
  },
});

// POST /api/sales  (AGENT) — sells from the distributor's own inventory.
export const create = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.string()),
    customer_id: v.string(),
    items: v.array(lineItem),
    paid_amount: v.optional(v.number()),
    notes: v.optional(v.string()),
    discount_type: v.optional(v.string()), // NONE | PERCENT | FIXED
    discount_value: v.optional(v.number()),
    lat: v.optional(v.union(v.number(), v.null())),
    lng: v.optional(v.union(v.number(), v.null())),
    client_created_at: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, a) => {
    const user = await require(ctx, a.token, AGENT);
    if (a.id) {
      const ex = await docOrgUnique(ctx, "sales", a.id, user.org_id!);
      if (ex) return clean(ex);
    }
    const cust = await orgCustomer(ctx, user, a.customer_id);
    if (!a.items.length) throw new Error("أضف منتجاً واحداً على الأقل");

    const items: any[] = [];
    let total = 0;
    for (const it of a.items) {
      const inv = await distInv(ctx, user.user_id, it.product_id);
      if (!inv || inv.quantity < it.quantity) throw new Error(`الكمية غير متوفرة لديك: ${inv?.product_name ?? ""}`);
      const price = await priceFor(ctx, user.org_id!, cust, it.product_id);
      const line = round2(it.quantity * price);
      total += line;
      items.push({ product_id: it.product_id, product_name: inv.product_name, quantity: it.quantity, price, total: line });
    }

    const subtotal = round2(total);
    let discount = 0;
    if (a.discount_type === "PERCENT") discount = round2((subtotal * Math.min(a.discount_value ?? 0, 100)) / 100);
    else if (a.discount_type === "FIXED") discount = round2(Math.min(a.discount_value ?? 0, subtotal));
    total = round2(subtotal - discount);
    const paid = Math.min(a.paid_amount ?? 0, total);

    for (const it of items) {
      const inv = await distInv(ctx, user.user_id, it.product_id);
      if (inv) await ctx.db.patch(inv._id, { quantity: round2(inv.quantity - it.quantity) });
      await logMovement(ctx, user.org_id!, it.product_id, it.product_name, "SALE", -it.quantity, user.name ?? null, "AGENT");
    }

    await ctx.db.patch(cust._id, { balance: round2((cust.balance ?? 0) + round2(total - paid)) });
    if (a.lat !== undefined && a.lat !== null && (cust.lat === undefined || cust.lat === null))
      await ctx.db.patch(cust._id, { lat: a.lat, lng: a.lng ?? null });

    const doc = {
      id: a.id || newId(),
      ...geoFields(a),
      org_id: user.org_id!,
      invoice_no: await nextNo(ctx, user.org_id!, "sale", "INV"),
      customer_id: cust.id,
      customer_name: cust.name,
      distributor_id: user.user_id,
      distributor_name: user.name ?? null,
      items,
      subtotal,
      discount_type: discount ? a.discount_type : "NONE",
      discount_value: discount ? a.discount_value ?? 0 : 0,
      discount_amount: discount,
      total,
      paid_amount: paid,
      remaining: round2(total - paid),
      payment_type: paid >= total ? "CASH" : "CREDIT",
      notes: a.notes ?? "",
      created_at: nowIso(),
    };
    await ctx.db.insert("sales", doc);
    return doc;
  },
});
