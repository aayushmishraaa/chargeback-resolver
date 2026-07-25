"use server"

import { z } from "zod";

const DisputeSchema = z.object({
  dispute_id: z.string().min(3, "Dispute ID must be at least 3 characters").max(50),
  customer_claim: z.string().min(10, "Claim must be at least 10 characters"),
  merchant_logs: z.string().min(10, "Logs must be provided"),
  customer_images: z.array(z.string()).nullable().optional()
});

export async function validateDispute(prevState: any, formData: FormData) {
  const imagesJson = formData.get("customer_images") as string;
  let images = null;
  if (imagesJson) {
    try { images = JSON.parse(imagesJson); } catch(e) {}
  }

  const data = {
    dispute_id: formData.get("dispute_id"),
    customer_claim: formData.get("customer_claim"),
    merchant_logs: formData.get("merchant_logs"),
    customer_images: images
  };

  const parsed = DisputeSchema.safeParse(data);

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      success: false,
      data: null
    };
  }

  return {
    success: true,
    errors: null,
    data: parsed.data,
  };
}
