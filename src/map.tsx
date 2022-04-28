import React, { useRef, useState, useMemo, useEffect } from 'react'

import { trackTransforms } from './track-transforms'
import { Marker } from './marker'
import { DropZone } from './drop-zone'
import { Tooltip } from './tooltip'
import type { Coords } from './types'

const SCALE_FACTOR = 1.1
const KEYDOWN_ESCAPE = 27

type Props = {
  image: string
  children?: React.ReactNode

  onClick?(): void
  onDoubleClick?(): void

  minZoom: number
  maxZoom: number
  overpan: number

  minDragTime: number
  clickGraceTime: number

  containInitialImage: boolean // begin with zoom/translation that contains intial image
  containUpdatedImage: boolean // update zoom/translation to contain a change of image
  allowContainmentZoom: boolean // allow zooming beyond min/max if image is not contained

  panTo?: Coords
}

type ScreenPositionCoords = {
  topLeft?: Coords
  bottomRight?: Coords
  valid: boolean
}

const Map: React.FC<Props> = ({
  image,
  children,

  onClick,
  onDoubleClick,

  minZoom = 0.2,
  maxZoom = 5,
  overpan = 30,

  minDragTime = 300,
  clickGraceTime = 100,

  containInitialImage = true,
  containUpdatedImage = true,
  allowContainmentZoom = true,

  panTo,
}) => {
  const canvasRef = useRef()
  useEffect(() => {
    if (canvasRef.current) {
      const context = canvasRef.current.getContext('2d')
      trackTransforms(context)
    }
  }, [])
  const mapImage = useRef()

  const dragged = useRef(false)
  const draggingMarkerKey = useRef(null)
  const dragTimeout = useRef(null)
  const clickPoint = useRef(null)
  const clickTime = useRef(+(new Date()))
  const cursorX = useRef(null)
  const cursorY = useRef(null)

  const animationActive = useRef(false)
  const animationCancel = useRef(false)
  const animationStart = useRef(null)
  const animationCoords = useRef(null)
  const animationLastTimestamp = useRef(+(new Date()))

  const markers = useRef()
  const dropZones = useRef()
  const flatChildren = useMemo(() => {
    const allChildren: React.ReactElement[] = []
    const getChildren = (child) => {
      if (Array.isArray(child)) {
        child.map(getChildren)
      } else if (child) {
        if (child.props && child.props.children && child.type !== Tooltip) {
          getChildren(child.props.children)
        } else {
          allChildren.push(child)
        }
      }
    }
    getChildren(children)
    return allChildren
  }, [children])
  markers.current = flatChildren.filter(child => {
    return child.type && child.type === Marker
  })
  const getMarkerChild: React.ReactElement = (key) => {
    return markers.current.find(child => {
      return child && child.props.markerKey === key
    })
  }
  dropZones.current = flatChildren.filter(child => {
    return child.type && child.type === DropZone
  })
  const tooltipChildren = useMemo(() => {
    return flatChildren.filter(child => {
      return child.type && child.type === Tooltip
    })
  }, [flatChildren])

  const getCursorCoords = () => {
    if (!canvasRef.current) {
      return null
    }
    const context = canvasRef.current.getContext('2d')
    if (
      typeof cursorX.current !== 'number' || isNaN(cursorX.current) ||
      typeof cursorY.current !== 'number' || isNaN(cursorY.current)
    ) {
      return null
    }
    return context.transformedPoint(cursorX.current, cursorY.current)
  }
  const getScreenPositionCoords = ({
    right,
    left,
    top,
    bottom,
    width,
    height,
  }) => {
    if (!canvasRef.current) {
      return {valid: false} as ScreenPositionCoords
    }
    const rect = canvasRef.current.getBoundingClientRect()
    const context = canvasRef.current.getContext('2d')

    let topLeft = {x: 0, y: 0}
    let bottomRight = {x: 100, y: 100}
    if (typeof top === 'number') {
      topLeft.y = top
      bottomRight.y = topLeft.y + height
    } else if (typeof bottom === 'number') {
      topLeft.y = rect.height - bottom - height
      bottomRight.y = topLeft.y + height
    } else {
      return {valid: false} as ScreenPositionCoords // no valid top/bottom dimensions
    }
    if (typeof left === 'number') {
      topLeft.x = left
      bottomRight.x = topLeft.x + width
    } else if (typeof right === 'number') {
      topLeft.x = rect.width - right - width
      bottomRight.x = topLeft.x + width
    } else {
      return {valid: false} as ScreenPositionCoords // no valid left/right dimensions
    }
    topLeft = context.transformedPoint(topLeft.x, topLeft.y)
    bottomRight = context.transformedPoint(bottomRight.x, bottomRight.y)
    return {topLeft, bottomRight, valid: true} as ScreenPositionCoords
  }
  const getDropZoneTouchingCursor: React.ReactElement = () => {
    const pt = getCursorCoords()
    if (pt === null) {
      return
    }
    // go through dropzones and see if it has landed in any
    let droppedZone = null
    dropZones.current.map(dropZone => {
      const {
        right,
        left,
        top,
        bottom,
        width,
        height,
      } = dropZone.props
      const {topLeft, bottomRight, valid} = getScreenPositionCoords({
        right,
        left,
        top,
        bottom,
        width,
        height,
      })
      if (!valid) {
        return
      }
      if (
        pt.x >= topLeft!.x &&
        pt.x <= bottomRight!.x &&
        pt.y >= topLeft!.y &&
        pt.y <= bottomRight!.y
      ) {
        droppedZone = dropZone
      }
    })
    return droppedZone
  }
  const getMarkerTouchingCursor = () => {
    if (!canvasRef.current) {
      return null
    }
    const context = canvasRef.current.getContext('2d')

    const close = {}

    const cursorPt = getCursorCoords()
    if (cursorPt === null) {
      return null
    }

    markers.current.forEach(child => {
      const {
        markerKey,
        coords,
  
        size = 100,
        scaleWithZoom = true,

        onClick,
        onDoubleClick,
  
        dragZoneScale = 1,
        onDragTick,
        onDragEnd,
      } = child.props
      if (!(
        typeof onClick === 'function' ||
        typeof onDoubleClick === 'function' ||
        typeof onDragTick === 'function' ||
        typeof onDragEnd === 'function'
      )) {
        return
      }
      const HOVER_DIST = (size / 2) * dragZoneScale
      const HOVER_DIST_SQ = HOVER_DIST * HOVER_DIST

      let distSq
      if (scaleWithZoom) {
        distSq = (
          Math.pow(coords.x - cursorPt.x, 2) +
          Math.pow(coords.y - cursorPt.y, 2)
        )
      } else {
        const beaconScreenPt = context.untransformedPoint(
          coords.x,
          coords.y
        )
        distSq = (
          Math.pow(beaconScreenPt.x - cursorX.current, 2) +
          Math.pow(beaconScreenPt.y - cursorY.current, 2)
        )
      }

      if (distSq < HOVER_DIST_SQ) {
        close[markerKey] = distSq
      }
    })
    let closestDist = -1
    let closest: string[] = []
    for (const key in close) {
      const distSq = close[key]
      if (closestDist === -1 || distSq < closestDist) {
        closestDist = distSq
        closest = []
        closest.push(key)
      } else if (distSq === closestDist) {
        closest.push(key)
      }
    }
    return closest[0]
  }
  const updateCursor = () => {
    if (!canvasRef.current) {
      return
    }
    const hovered = getMarkerTouchingCursor()
    if (hovered) {
      canvasRef.current.style.cursor = 'pointer'
    } else {
      canvasRef.current.style.cursor = 'auto'
    }
  }

  const tooltipsRef = useRef()
  const updateTooltips = () => {
    if (!canvasRef.current || !tooltipsRef.current) {
      return
    }
    const canvasRect = canvasRef.current.getBoundingClientRect()
    const context = canvasRef.current.getContext('2d')
    Array.from(tooltipsRef.current.children).forEach((child) => {
      const domChild = child as HTMLElement
      const tooltipX = domChild.dataset['x']
      const tooltipY = domChild.dataset['y']

      const screenCoords = context.untransformedPoint(tooltipX, tooltipY)
      const relativeX = screenCoords.x / canvasRect.width
      const relativeY = screenCoords.y / canvasRect.height
      domChild.style.setProperty('left', `${relativeX * 100}%`)
      domChild.style.setProperty('top', `${relativeY * 100}%`)
    })
  }

  const lastRedraw = useRef(+(new Date()))
  const logRedraw = (reason) => {
    return
    const nowMs = +(new Date())
    const idleMs = nowMs - lastRedraw.current
    lastRedraw.current = nowMs
    console.log(`redrawing for ${reason} after ${idleMs}`)
  }
  const redraw = (reason) => {
    if (!canvasRef.current) {
      return
    }
    logRedraw(reason)
    const context = canvasRef.current.getContext('2d')
    
    // Clear the entire canvas
    const p1 = context.transformedPoint(0, 0)
    const p2 = context.transformedPoint(canvasRef.current.width, canvasRef.current.height)
    context.clearRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)

    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    context.restore()

    if (mapImage.current) {
      context.drawImage(mapImage.current, 0, 0, mapImage.current.width, mapImage.current.height)
    }

    const scale = Math.min(context.getTransform().a, context.getTransform().d)
    const renderMarkers = (child) => {
      const {
        coords,

        image,
        inCircle = false,
        circleColour = '#337ab7',
        size = 100,
        scaleWithZoom = true,
      } = child.props

      if (!image) {
        return
      }

      let coverWidthScale = 1
      let coverHeightScale = 1
      if (image.width > image.height) {
        coverHeightScale = image.height / image.width
      } else {
        coverWidthScale = image.width / image.height
      }

      const scaledSize = scaleWithZoom ? size : size / scale
      const centreX = coords.x
      const centreY = coords.y
      if (inCircle) {
        const imageSize = scaledSize * 0.55
        const renderWidth = imageSize * coverWidthScale
        const renderHeight = imageSize * coverHeightScale

        context.beginPath()
        context.arc(centreX, centreY, scaledSize / 2, 0, 2 * Math.PI, false)
        context.fillStyle = circleColour
        context.fill()
        context.drawImage(
          image,
          centreX - (renderWidth / 2),
          centreY - (renderHeight / 2),
          renderWidth,
          renderHeight
        )
      } else {
        const renderWidth = scaledSize * coverWidthScale
        const renderHeight = scaledSize * coverHeightScale
        context.drawImage(
          image,
          centreX - (renderWidth / 2),
          centreY - (renderHeight / 2),
          renderWidth,
          renderHeight
        )
      }
    }

    const draggingMarker = getMarkerChild(draggingMarkerKey.current)
    markers.current.filter(child => {
      return child !== draggingMarker
    }).map(renderMarkers)
    if (draggingMarker && dragged.current) {
      const hoverDropZone = getDropZoneTouchingCursor()
      const renderDropZones = (child) => {
        const {
          right,
          left,
          top,
          bottom,
          width,
          height,
          
          label,
          colour = '#fff',
          backgroundColour = '#0f0',
          fontSize = 24,
          image,
        } = child.props
        const {topLeft, bottomRight, valid} = getScreenPositionCoords({
          right,
          left,
          top,
          bottom,
          width,
          height,
        })
        if (!valid) {
          return
        }

        context.globalAlpha = child === hoverDropZone ? 1 : 0.7
        context.beginPath()
        context.fillStyle = backgroundColour
        context.fillRect(topLeft!.x, topLeft!.y, bottomRight!.x - topLeft!.x, bottomRight!.y - topLeft!.y)
        if (image) {
          context.drawImage(
            image,
            topLeft!.x,
            topLeft!.y,
            bottomRight!.x - topLeft!.x,
            bottomRight!.y - topLeft!.y
          )
        }
        context.textAlign = 'center'
        context.fillStyle = colour
        context.font = `${fontSize / scale}px Arial`
        context.fillText(
          label,
          (bottomRight!.x + topLeft!.x) / 2,
          (bottomRight!.y + topLeft!.y) / 2 + (fontSize / 4) / scale
        )
        context.globalAlpha = 1
      }
      dropZones.current.map(renderDropZones)
    }
    markers.current.filter(child => {
      return child === draggingMarker
    }).map(renderMarkers)
    updateTooltips()
    updateCursor()
  }
  useEffect(() => {
    redraw('new children')
  }, [flatChildren])

  const resetView = () => {
    if (!canvasRef.current) {
      return
    }
    const context = canvasRef.current.getContext('2d')

    const transform = context.getTransform()
    const maxScale = Math.max(transform.a, transform.d)
    context.setTransform(maxScale, 0, 0, maxScale, transform.e, transform.f)
    redraw('view reset')
  }
  
  // scale at which the provided image totally covers the canvas
  const [containmentScale, setContainmentScale] = useState(1)
  
  const maxImageZoom = useMemo(() => {
    if (allowContainmentZoom) {
      return Math.max(maxZoom, containmentScale)
    }
    return maxZoom
  }, [allowContainmentZoom, maxZoom, containmentScale])
  const minImageZoom = useMemo(() => {
    if (allowContainmentZoom) {
      return Math.min(minZoom, containmentScale)
    }
    return minZoom
  }, [allowContainmentZoom, minZoom, containmentScale])
  
  const updateContainmentScale = () => {
    if (!canvasRef.current || !mapImage.current) {
      return
    }
    const imgWidth = mapImage.current.width
    const imgHeight = mapImage.current.height
    if (imgWidth && imgHeight) {
      const widthScaledHeight = (imgHeight / imgWidth) * canvasRef.current.width
      let updatedScale = 1
      if (widthScaledHeight > canvasRef.current.height) {
        updatedScale = canvasRef.current.height / imgHeight
      }
      else {
        updatedScale = canvasRef.current.width / imgWidth
      }
      setContainmentScale(updatedScale)
    }
  }
  const [imageInitialised, setImageInitialised] = useState(false)
  const handleImageLoad = useMemo(() => {
    return () => {
      if (!canvasRef.current || !mapImage.current) {
        return
      }
      const context = canvasRef.current.getContext('2d')
      const imgWidth = mapImage.current.width
      const imgHeight = mapImage.current.height
      if (imgWidth && imgHeight) {
        const containing = (
          (!imageInitialised && containInitialImage) ||
          (imageInitialised && containUpdatedImage)
        )
        const widthScaledHeight = (imgHeight / imgWidth) * canvasRef.current.width
        const heightScaledWidth = (imgWidth / imgHeight) * canvasRef.current.height
        let containmentScale = 1
        if (widthScaledHeight > canvasRef.current.height) {
          containmentScale = canvasRef.current.height / imgHeight
          if (containing) {
            let transform = context.getTransform()
            let scaleAdjust = containmentScale / transform.d
            context.scale(scaleAdjust, scaleAdjust)
            transform = context.getTransform()
            context.translate(
              (-transform.e + (canvasRef.current.width / 2) - (heightScaledWidth / 2)) / transform.a,
              -transform.f / transform.d
            )
          }
        }
        else {
          containmentScale = canvasRef.current.width / imgWidth
          if (containing) {
            let transform = context.getTransform()
            const scaleAdjust =  containmentScale / transform.a
            context.scale(scaleAdjust, scaleAdjust)
            transform = context.getTransform()
            context.translate(
              -transform.e / transform.a,
              (-transform.f + (canvasRef.current.height / 2) - (widthScaledHeight / 2)) / transform.d
            )
          }
        }
        updateContainmentScale()
        redraw('image load')
        if (!imageInitialised) {
          setImageInitialised(true)
        }
      }
    }
  }, [imageInitialised])

  const resize = useMemo(() => {
    return () => {
      if (!canvasRef.current) {
        return
      }
    
      if (cursorX.current !== null && cursorY.current !== null)
      {
        const cursorXProportion = cursorX.current / canvasRef.current.clientWidth
        const cursorYProportion = cursorY.current / canvasRef.current.clientHeight
    
        cursorX.current = cursorXProportion * canvasRef.current.width
        cursorY.current = cursorYProportion * canvasRef.current.height
      }
  
      canvasRef.current.width = canvasRef.current.clientWidth
      canvasRef.current.height = canvasRef.current.clientHeight
  
      // reset the transforms
      // todo: rescale the transforms to match the new size instead
      updateContainmentScale()
      resetView()
    }
  }, [resetView])
  useEffect(() => {
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
    }
  }, [resize])

  const handleClick = useMemo(() => {
    return () => {
      const pt = getCursorCoords()
      if (pt === null) {
        return
      }
  
      let clickedMarker: React.ReactElement = null
      if (draggingMarkerKey.current) {
        clickedMarker = getMarkerChild(draggingMarkerKey.current)
      }
      if (clickedMarker) {
        if (typeof clickedMarker.props.onClick === 'function') {
          clickedMarker.props.onClick()
        }
      } else {
        if (typeof onClick === 'function') {
          onClick(pt)
        }
      }
    }
  }, [onClick])
  const dragTick = (draggingMarkerKey) => {
    const pt = getCursorCoords()
    if (pt === null) {
      return
    }
    const draggingMarker = getMarkerChild(draggingMarkerKey)
    if (draggingMarker && typeof draggingMarker.props.onDragTick === 'function') {
      draggingMarker.props.onDragTick(pt)
    }
  }
  const dragEnd = (draggingMarkerKey) => {
    const pt = getCursorCoords()
    if (pt === null) {
      return
    }
    const draggedMarker = getMarkerChild(draggingMarkerKey)
    if (!draggedMarker) {
      return
    }

    const droppedZone = getDropZoneTouchingCursor()
    if (droppedZone) {
      if (typeof draggedMarker.props.onDragCancel === 'function') {
        draggedMarker.props.onDragCancel()
      }
      if (typeof droppedZone.props.onDrop === 'function') {
        droppedZone.props.onDrop(draggedMarker.props)
      }
    } else if (typeof draggedMarker.props.onDragEnd === 'function') {
      draggedMarker.props.onDragEnd(pt)
    }
  }

  const handleDocumentMouseMove = useMemo(() => {
    return (event) => {
      if (!canvasRef.current) {
        return
      }
      const context = canvasRef.current.getContext('2d')
      
      const lastPt = getCursorCoords()
      const rect = canvasRef.current.getBoundingClientRect()
      if (event) {
        cursorX.current = event.clientX - rect.x
        cursorY.current = event.clientY - rect.y
      }
      
      if (!clickPoint.current) {
        updateCursor()
        return
      }
  
      if (+(new Date()) > clickTime.current + clickGraceTime) {
        dragged.current = true
      }
  
      if (draggingMarkerKey.current) {
        if (new Date() > clickTime.current + minDragTime) {
          dragTick(draggingMarkerKey.current)
        }
      } else {
        const pt = getCursorCoords()
        if (pt === null || lastPt === null || !mapImage.current) {
          return
        }
        const transform = context.getTransform()
        let translateX = pt.x - lastPt.x
        let translateY = pt.y - lastPt.y
        if (translateX > 0) {
          const xLimit = rect.width - overpan
          if (transform.e > xLimit) {
            translateX = 0
          } else if (transform.e + translateX > xLimit) {
            translateX = xLimit - transform.e
          }
        } else if (translateX < 0) {
          const xLimit = -(mapImage.current.width * transform.a) + overpan
          if (transform.e < xLimit) {
            translateX = 0
          } else if (transform.e + translateX < xLimit) {
            translateX = xLimit - transform.e
          }
        }
        if (translateY > 0) {
          const yLimit = rect.height - overpan
          if (transform.f > yLimit) {
            translateY = 0
          } else if (transform.f + translateY > yLimit) {
            translateY = yLimit - transform.f
          }
        } else if (translateY < 0) {
          const yLimit = -(mapImage.current.height * transform.d) + overpan
          if (transform.f < yLimit) {
            translateY = 0
          } else if (transform.f + translateY < yLimit) {
            translateY = yLimit - transform.f
          }
        }
        context.translate(translateX, translateY)
        redraw('pan')
      }
    }
  }, [clickGraceTime, minDragTime, overpan])
  useEffect(() => {
    document.addEventListener('mousemove', handleDocumentMouseMove, false)
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove, false)
    }
  }, [handleDocumentMouseMove])

  const handleDocumentMouseUp = useMemo(() => {
    return () => {
      if (dragTimeout.current) {
        window.clearTimeout(dragTimeout.current)
      }
      if (
        draggingMarkerKey.current &&
        dragged.current &&
        new Date() > clickTime.current + minDragTime
      ) {
        dragEnd(draggingMarkerKey.current)
      }
      draggingMarkerKey.current = null
      clickPoint.current = null
      dragged.current = false
      redraw('mouse up')
    }
  }, [minDragTime])
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }
    canvasRef.current.addEventListener('mouseup', handleCanvasMouseUp)
    return () => {
      canvasRef.current.removeEventListener('mouseup', handleCanvasMouseUp)
    }
  }, [handleDocumentMouseUp])

  const handleCanvasMouseDown = useMemo(() => {
    return () => {
      animationCancel.current = true
  
      // @ts-ignore: Old vendor prefixes
      document.body.style.mozUserSelect = document.body.style.webkitUserSelect = document.body.style.userSelect = 'none'
      clickPoint.current = getCursorCoords()
      dragTimeout.current = window.setTimeout(handleDocumentMouseMove, minDragTime)
      clickTime.current = +(new Date())
      dragged.current = false
      draggingMarkerKey.current = getMarkerTouchingCursor()
    }
  }, [minDragTime, handleDocumentMouseMove])
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }
    canvasRef.current.addEventListener('mousedown', handleCanvasMouseDown, false)
    return () => {
      canvasRef.current.removeEventListener('mousedown', handleCanvasMouseDown, false)
    }
  }, [handleCanvasMouseDown])

  const handleCanvasMouseUp = useMemo(() => {
    return () => {
      if (!dragged.current) {
        handleClick()
      }
    }
  }, [handleClick])
  useEffect(() => {
    document.addEventListener('mouseup', handleDocumentMouseUp, false)
    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp, false)
    }
  }, [handleDocumentMouseUp])

  const zoom = useMemo(() => {
    return (clicks) => {
      if (!canvasRef.current) {
        return
      }
      const context = canvasRef.current.getContext('2d')
  
      const pt = getCursorCoords()
      if (pt === null) {
        return
      }
      context.translate(pt.x, pt.y)
      let factor = Math.pow(SCALE_FACTOR, clicks)
      // limit zoom to given ranges in props
      const transform = context.getTransform()
      if (factor > 1) {
        const maxScale = Math.max(transform.a, transform.d)
        if (maxScale * factor > maxImageZoom) {
          factor = maxImageZoom / maxScale
        }
      } else {
        const minScale = Math.max(transform.a, transform.d)
        if (minScale * factor < minImageZoom) {
          factor = minImageZoom / minScale
        }
      }
      context.scale(factor, factor)
      context.translate(-pt.x, -pt.y)
      redraw('zoom')
    }
  }, [maxImageZoom, minImageZoom])
  const handleScroll = useMemo(() => {
    return (event) => {
      animationCancel.current = true
  
      const delta = event.wheelDelta ? event.wheelDelta / 40 : event.detail ? -event.detail : 0
      if (delta) {
        zoom(delta)
      }
      return event.preventDefault() && false
    }
  }, [zoom])
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }
    canvasRef.current.addEventListener('DOMMouseScroll', handleScroll, false)
    canvasRef.current.addEventListener('mousewheel', handleScroll, false)
    return () => {
      canvasRef.current.removeEventListener('DOMMouseScroll', handleScroll, false)
      canvasRef.current.removeEventListener('mousewheel', handleScroll, false)
    }
  }, [handleScroll])

  const handleDocumentKeyDown = (event) => {
    if (event.which === KEYDOWN_ESCAPE) {
      const draggingMarker = getMarkerChild(draggingMarkerKey.current)
      if (draggingMarker && typeof draggingMarker.props.onDragCancel === 'function') {
        draggingMarker.props.onDragCancel()
      }
      clickPoint.current = null
      dragged.current = false
      redraw('mouse down')
    }
  }
  useEffect(() => {
    document.addEventListener('keydown', handleDocumentKeyDown, false)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, false)
    }
  }, [])

  const handleDragOver = (event) => {
    if (!canvasRef.current) {
      return
    }
    const rect = canvasRef.current.getBoundingClientRect()
    if (event) {
      cursorX.current = event.clientX - rect.x
      cursorY.current = event.clientY - rect.y
    }
  }
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }
    canvasRef.current.addEventListener('dragover', handleDragOver, false)
    return () => {
      canvasRef.current.removeEventListener('dragover', handleDragOver, false)
    }
  }, [])
  
  const handleDoubleClick = useMemo(() => {
    return () => {
      if (!canvasRef.current) {
        return
      }
      const context = canvasRef.current.getContext('2d')
  
      let clickedMarker: React.ReactElement = null
      if (draggingMarkerKey.current) {
        clickedMarker = getMarkerChild(draggingMarkerKey.current)
      } else {
        const hovered = getMarkerTouchingCursor()
        if (hovered) {
          clickedMarker = getMarkerChild(hovered)
        }
      }
      if (clickedMarker) {
        if (typeof clickedMarker.props.onDoubleClick === 'function') {
          clickedMarker.props.onDoubleClick()
        }
      } else {
        if (typeof onDoubleClick === 'function') {
          const pt = context.transformedPoint(cursorX.current, cursorY.current)
          onDoubleClick(pt)
        }
      }
    }
  }, [onDoubleClick])
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }
    canvasRef.current.addEventListener('dblclick', handleDoubleClick)
    return () => {
      canvasRef.current.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [handleDoubleClick])

  useEffect(() => {
    mapImage.current = new Image()
    mapImage.current.src = image
    mapImage.current.onload = handleImageLoad
  }, [image])
  useEffect(() => {
    if (mapImage.current) {
      mapImage.current.onload = handleImageLoad
    }
  }, [handleImageLoad])

  useEffect(() => {
    resize()
  }, [])

  const animate = (timestamp) => {
    if (animationCancel.current) {
      animationStart.current = null
      animationCancel.current = false
      animationActive.current = false
      return
    }

    if (!canvasRef.current) {
      // abort and try later
      window.requestAnimationFrame(animate)
      return
    }
    const rect = canvasRef.current.getBoundingClientRect()
    const context = canvasRef.current.getContext('2d')
    const transform = context.getTransform()

    if (!animationStart.current) {
      animationStart.current = timestamp
      animationLastTimestamp.current = timestamp
    }

    const deltaMs = timestamp - animationLastTimestamp.current
    animationLastTimestamp.current = timestamp

    let panDone = true
    if (animationCoords.current) {
      const current = {
        x: ((rect.width / 2) - transform.e) / transform.a,
        y: ((rect.height / 2) - transform.f) / transform.d,
      }
      const desired = animationCoords.current

      const diff = {
        x: desired.x - current.x,
        y: desired.y - current.y,
      }
      const dist = Math.sqrt(Math.pow(diff.x, 2) + Math.pow(diff.y, 2))
      panDone = dist < 1
      if (!panDone) {
        const delta = Math.min(Math.max(deltaMs * 0.005, 0), 1)
        context.translate(-diff.x * delta, -diff.y * delta)
      } else {
        context.translate(-diff.x, -diff.y)
        animationCoords.current = null
      }
    }

    redraw('animation')

    animationActive.current = !panDone
    if (!panDone) {
      window.requestAnimationFrame(animate)
    }
  }
  const animatePanTo = (coords) => {
    animationCancel.current = false
    animationStart.current = null
    animationCoords.current = coords
    if (!animationActive.current) {
      window.requestAnimationFrame(animate)
    }
    animationActive.current = true
  }
  useEffect(() => {
    if (panTo) {
      animatePanTo(panTo)
    }
  }, [panTo])

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} style={{width: '100%', height: '100%'}} />
      <div ref={tooltipsRef}>
        {tooltipChildren}
      </div>
    </div>
  )
}

export { Map }