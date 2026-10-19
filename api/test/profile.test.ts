import { describe, expect, it } from 'vitest'
import { isPince, PINCE, profilePoints, segmentDistance, selfIntersection } from '../src/profile.js'

describe('Géométrie du profil', () => {
  it('place les points à partir des cotes et des angles signés', () => {
    const { pts } = profilePoints([100, 50], [90])
    expect(pts[1]).toEqual([100, 0])
    expect(pts[2]![0]).toBeCloseTo(100)
    expect(pts[2]![1]).toBeCloseTo(50)
    expect(profilePoints([100, 50], [-90]).pts[2]![1]).toBeCloseTo(-50)
  })

  it('mesure la distance entre deux segments', () => {
    expect(segmentDistance([0, 0], [10, 0], [5, -5], [5, 5])).toBe(0)
    expect(segmentDistance([0, 0], [10, 0], [0, 3], [10, 3])).toBe(3)
    expect(segmentDistance([0, 0], [10, 0], [12, 0], [20, 0])).toBe(2)
  })

  it('repère un profil qui se recoupe, mais pas une pince ni une couvertine', () => {
    expect(selfIntersection([100, 100, 100, 100, 100], [90, 90, 90, 90], 1.5)).toEqual([0, 3])
    // Un U très fermé : les deux ailes à moins d'une épaisseur l'une de l'autre
    expect(selfIntersection([50, 1, 50], [91, 91], 1.5)).toEqual([0, 2])
    expect(selfIntersection([20, 70, 300, 70, 20], [-135, 90, 90, -135], 1.5)).toBeNull()
    expect(selfIntersection([15, 200, 60], [PINCE, 90], 1.5)).toBeNull()
    expect(isPince(-PINCE)).toBe(true)
    expect(isPince(90)).toBe(false)
  })
})
