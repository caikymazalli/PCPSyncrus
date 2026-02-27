import * as Joi from 'joi';

export const productionOrderSchema = Joi.object({
    orderId: Joi.string().guid({ version: ['uuidv4', 'uuidv1'] }).required(),
    productId: Joi.string().guid({ version: ['uuidv4', 'uuidv1'] }).required(),
    quantity: Joi.number().integer().min(1).required(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').required(),
    createdAt: Joi.date().iso().default(() => new Date(), 'current date and time'),
    updatedAt: Joi.date().iso().default(() => new Date(), 'current date and time'),
});