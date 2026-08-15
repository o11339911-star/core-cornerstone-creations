import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 24 — stores, carts and orders behind a server-side feature flag.
 *
 * The flag is enforced in the database (`COMMERCE_DISABLED`), not by hiding
 * the UI. Payment is cash on delivery or a documented bank transfer with an
 * uploaded receipt — no electronic payment and no claimed integration.
 */

const uuid = z.string().uuid();

export const storeSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  name: z.string(),
  country_code: z.string(),
  status: z.string(),
  created_at: z.string(),
});
export type Store = z.infer<typeof storeSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.union([z.number(), z.string()]),
  is_active: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

export const orderSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  buyer_entity_id: z.string().uuid(),
  payment_method: z.string(),
  status: z.string(),
  total_amount: z.union([z.number(), z.string()]),
  receipt_path: z.string().nullable(),
  created_at: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const isCommerceEnabled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ countryCode: z.string().min(2).max(2).default("SA") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<boolean> => {
    const [globalFlag, country] = await Promise.all([
      context.supabase
        .from("feature_flags")
        .select("code, enabled_globally")
        .eq("code", "commerce")
        .maybeSingle(),
      context.supabase
        .from("feature_flag_countries")
        .select("code")
        .eq("code", "commerce")
        .eq("country_code", data.countryCode)
        .maybeSingle(),
    ]);
    return Boolean(globalFlag.data?.enabled_globally) || Boolean(country.data);
  });

export const listStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Store[]> => {
    const { data, error } = await context.supabase
      .from("stores")
      .select("id, entity_id, name, country_code, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(storeSchema).parse(data ?? []);
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ storeId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<Product[]> => {
    const { data: rows, error } = await context.supabase
      .from("store_products")
      .select("id, store_id, name, description, price, is_active")
      .eq("store_id", data.storeId)
      .order("name");
    if (error) throw new Error(error.message);
    return z.array(productSchema).parse(rows ?? []);
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Order[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, store_id, buyer_entity_id, payment_method, status, total_amount, receipt_path, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return z.array(orderSchema).parse(data ?? []);
  });

export const openStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid,
        name: z.string().min(2).max(120),
        countryCode: z.string().min(2).max(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("open_store", {
      _entity_id: data.entityId,
      _name: data.name,
      _country_code: data.countryCode,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const addStoreProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storeId: uuid,
        name: z.string().min(2).max(160),
        price: z.number().min(0),
        description: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("add_store_product", {
      _store_id: data.storeId,
      _name: data.name,
      _price: data.price,
      ...(data.description ? { _description: data.description } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const createCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ buyerEntityId: uuid, storeId: uuid }).parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("create_cart", {
      _buyer_entity_id: data.buyerEntityId,
      _store_id: data.storeId,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const addCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ cartId: uuid, productId: uuid, quantity: z.number().int().min(1).max(999) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("add_cart_item", {
      _cart_id: data.cartId,
      _product_id: data.productId,
      _quantity: data.quantity,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cartId: uuid, paymentMethod: z.enum(["cod", "bank_transfer"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("place_order", {
      _cart_id: data.cartId,
      _payment_method: data.paymentMethod,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const attachPaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: uuid, receiptPath: z.string().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("attach_payment_receipt", {
      _order_id: data.orderId,
      _receipt_path: data.receiptPath,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const confirmOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_order_payment", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    return true;
  });
