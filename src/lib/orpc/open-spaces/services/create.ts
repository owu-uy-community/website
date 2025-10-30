import { prisma } from '../../../prisma'
import type { CreateOpenSpaceInput, OpenSpace } from '../schemas'
import type { OpenSpace as PrismaOpenSpace } from '../../../../generated/prisma'

/**
 * Transform database open space to API format
 */
const transformOpenSpace = (openSpace: PrismaOpenSpace): OpenSpace => ({
  ...openSpace,
  startDate: openSpace.startDate.toISOString(),
  endDate: openSpace.endDate.toISOString(),
  description: openSpace.description || undefined,
  createdAt: openSpace.createdAt.toISOString(),
  updatedAt: openSpace.updatedAt.toISOString(),
})

/**
 * Create a new open space
 */
export const createOpenSpace = async (input: CreateOpenSpaceInput): Promise<OpenSpace> => {
  // Parse dates once for validation and usage
  const startDate = new Date(input.startDate)
  const endDate = new Date(input.endDate)

  // Validate date range
  if (endDate <= startDate) {
    throw new Error('End date must be after start date')
  }

  const openSpace = await prisma.openSpace.create({
    data: {
      name: input.name,
      description: input.description || null,
      startDate,
      endDate,
      isActive: input.isActive,
    }
  })
  
  return transformOpenSpace(openSpace)
}

