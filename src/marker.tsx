import React from 'react'

import type { Coords } from './types'

type MarkerProps = {
  markerKey: string
  coords: Coords
  image: HTMLImageElement

  inCircle?: boolean
  circleColour?: string
  size?: number
  scaleWithZoom?: boolean
  indexMarker:number
  title:string
  color?:string
  description:string
  numberDisplay:number
  fontSize?:number
  fontFamily?:string
  offsetX:number
  offsetY:number

  onClick?(): void
  onDoubleClick?(): void

  dragZoneScale?: number
  onDragTick?(coords: Coords): void
  onDragEnd?(coords: Coords): void
  onDragCancel?(): void
}

const Marker: React.FC<MarkerProps> = () => null

export { Marker }
export type { MarkerProps }
