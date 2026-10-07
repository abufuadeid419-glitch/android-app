import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { OWNER, STAFF, checkLowStock, cleanAll, docOrgUnique, logMovement, newId, nextNo, nowIso, require, round2 } from "./lib";

// GET /api/purchases (STAFF) — warehouse stock-in, newest first.
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await require(ctx, token, STAFF);
    const rows = await ctx.db.query("purchases").withIndex("by_org", (q) => q.eq("org_id", user.org_id!)).collect();
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return cleanAll(rows);
  },
});

// POST /api/purchases (OWNER) — add stock to the warehouse; updates product cost.
export const create = mutation({
  args: { token: v.string(), product_id: v.string(), quantity: v.number(), unit_cost: v.number(), supplier: v.optional(v.string()) },
  handler: async (ctx, { token, product_id, quantity, unit_cost, supplier }) => {
    const user = await require(ctx, token, OWNER);
    if (quantity <= 0) throw new Error("الكمية غير صالحة");
    const prod = await docOrgUnique(ctx, "products", product_id, user.org_id!);
    if (!prod) throw new Error("المنتج غير موجود");
    const doc = {
      id: newId(),
      org_id: user.org_id!,
      product_id: prod.id,
      product_name: prod.name,
      quantity,
      unit_cost,
      total: round2(quantity * unit_cost),
      supplier: supplier ?? "",
      created_at: nowIso(),
    };
    await ctx.db.insert("purchases", doc);
    await ctx.db.patch(prod._id, { stock: round2((prod.stock ?? 0) + quantity), cost_price: unit_cost });
    await logMovement(ctx, user.org_id!, prod.id, prod.name, "PURCHASE", quantity, user.name ?? null);
    return doc;
  },
});

// GET /api/purchase-returns (STAFF)
export const listReturns = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await require(ctx, token, STAFF);
    const rows = await ctx.db.query("purchase_returns").withIndex("by_org", (q) => q.eq("org_id", user.org_id!)).collect();
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return cleanAll(rows);
  },
});

// POST /api/purchase-returns (OWNER) — return stock to a supplier (warehouse stock out).
export const createReturn = mutation({
  args: { token: v.string(), product_id: v.string(), quantity: v.number(), unit_cost: v.number(), supplier: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, { token, product_id, quantity, unit_cost, supplier, reason }) => {
    const user = await require(ctx, token, OWNER);
    if (quantity <= 0) throw new Error("الكمية غير صالحة");
    const prod = await docOrgUnique(ctx, "products", product_id, user.org_id!);
    if (!prod) throw new Error("المنتج غير موجود");
    if ((prod.stock ?? 0) < quantity) throw new Error("الكمية أكبر من المتوفر في المستودع");
    const doc = {
      id: newId(),
      org_id: user.org_id!,
      return_no: await nextNo(ctx, user.org_id!, "pret", "PRT"),
      product_id: prod.id,
      product_name: prod.name,
      quantity,
      unit_cost,
      total: round2(quantity * unit_cost),
      supplier: supplier ?? "",
      reason: reason ?? "",
      created_at: nowIso(),
    };
    await ctx.db.insert("purchase_returns", doc);
    await ctx.db.patch(prod._id, { stock: round2((prod.stock ?? 0) - quantity) });
    await logMovement(ctx, user.org_id!, prod.id, prod.name, "PURCHASE_RETURN", -quantity, user.name ?? null);
    await checkLowStock(ctx, user.org_id!, [prod.id]);
    return doc;
  },
});
