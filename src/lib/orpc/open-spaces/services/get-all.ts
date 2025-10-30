import { prisma } from '../../../prisma'
import type { OpenSpace } from '../schemas'
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
 * Get all open spaces ordered by creation date
 */
export const getAllOpenSpaces = async (): Promise<OpenSpace[]> => {
  const openSpaces = await prisma.openSpace.findMany({
    orderBy: { createdAt: 'desc' }
  })
  
  return openSpaces.map(transformOpenSpace)
}

