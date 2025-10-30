import { prisma } from '../../../prisma'
import type { DeleteOpenSpaceInput, OpenSpace } from '../schemas'
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
 * Delete an open space by ID
 * Note: This will cascade delete all related rooms, schedules, and tracks
 */
export const deleteOpenSpace = async ({ id }: DeleteOpenSpaceInput): Promise<OpenSpace> => {
  try {
    const openSpace = await prisma.openSpace.delete({
      where: { id }
    })
    
    return transformOpenSpace(openSpace)
  } catch (error) {
    // Prisma throws P2025 when record is not found
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      throw new Error('OpenSpace not found')
    }
    throw error
  }
}

