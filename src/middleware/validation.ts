import { z } from 'zod';

// Example validation schema for a user object
const userSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
});

// Example validation schema for a product object
const productSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  price: z.number().positive(),
});

export { userSchema, productSchema };