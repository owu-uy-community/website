import { z } from 'zod'

/**
 * Core OpenSpace schema with all fields
 */
export const OpenSpaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().default(true),
  autoHighlightEnabled: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

/**
 * Schema for creating a new open space (omits auto-generated fields)
 */
export const CreateOpenSpaceSchema = OpenSpaceSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
})

/**
 * Schema for updating an open space (all fields optional except constraints)
 */
export const UpdateOpenSpaceSchema = CreateOpenSpaceSchema.partial()

/**
 * Schema for getting an open space by ID
 */
export const GetOpenSpaceSchema = z.object({
  id: z.string().min(1, 'OpenSpace ID is required')
})

/**
 * Schema for deleting an open space by ID
 */
export const DeleteOpenSpaceSchema = z.object({
  id: z.string().min(1, 'OpenSpace ID is required')
})

/**
 * Schema for updating an open space with ID and data
 */
export const UpdateOpenSpaceInputSchema = z.object({
  id: z.string().min(1, 'OpenSpace ID is required'),
  data: UpdateOpenSpaceSchema
})

// Type exports
export type OpenSpace = z.infer<typeof OpenSpaceSchema>
export type CreateOpenSpaceInput = z.infer<typeof CreateOpenSpaceSchema>
export type UpdateOpenSpaceInput = z.infer<typeof UpdateOpenSpaceSchema>
export type GetOpenSpaceInput = z.infer<typeof GetOpenSpaceSchema>
export type DeleteOpenSpaceInput = z.infer<typeof DeleteOpenSpaceSchema>
export type UpdateOpenSpaceInputType = z.infer<typeof UpdateOpenSpaceInputSchema>
