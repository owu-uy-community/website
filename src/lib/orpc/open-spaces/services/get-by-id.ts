import { prisma } from '../../../prisma'
import type { GetOpenSpaceInput, OpenSpace } from '../schemas'
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
 * Get a single open space by ID
 */
export const getOpenSpaceById = async ({ id }: GetOpenSpaceInput): Promise<OpenSpace> => {
  const openSpace = await prisma.openSpace.findUnique({
    where: { id }
  })
  
  if (!openSpace) {
    throw new Error('OpenSpace not found')
  }
  
  return transformOpenSpace(openSpace)
}

