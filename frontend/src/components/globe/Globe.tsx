import { useEffect, useRef, useState } from 'react';
import { Plane, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { getGlobeData } from '../../api/client';
import { GLOBE_RADIUS, buildRouteLegPositions, horizonPlaneOffset } from '../../lib/geo';
import type { GlobePoint } from '../../types';

// Lazy import globe.gl to prevent it from breaking on unsupported devices
type GlobeGLType = typeof import('globe.gl').default;
type GlobeInstanceType = import('globe.gl').GlobeInstance;

// OpenStreetMap tile URL template (for desktop)
const OSM_TILE_URL = (x: number, y: number, z: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Fallback globe texture (NASA Blue Marble)
const GLOBE_IMAGE_URL = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

// Route geometry lives in lib/geo so the spherical maths can be tested directly.

interface GlobeProps {
  onPinClick?: (postId: number) => void;
  onPinHover?: (postId: number | null) => void;
  selectedPostId?: number | null;
}

// Pin colors
const PIN_COLOR_DEFAULT = '#0891b2';
const PIN_COLOR_SELECTED = '#10b981';

// Check WebGL support and warm up context
function initWebGL(): { supported: boolean; gl: WebGLRenderingContext | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      return { supported: false, gl: null };
    }
    // Keep the context alive by storing reference
    return { supported: true, gl: gl as WebGLRenderingContext };
  } catch {
    return { supported: false, gl: null };
  }
}

// Store WebGL context globally to keep it alive (exported to prevent unused var error)
export let webGLContextRef: WebGLRenderingContext | null = null;


export function Globe({ onPinClick, onPinHover, selectedPostId }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstanceType | null>(null);
  const onPinClickRef = useRef(onPinClick);
  const onPinHoverRef = useRef(onPinHover);
  const pinElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const [points, setPoints] = useState<GlobePoint[]>([]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [GlobeGL, setGlobeGL] = useState<GlobeGLType | null>(null);
  const [webGLSupported] = useState(() => {
    const result = initWebGL();
    webGLContextRef = result.gl; // Keep context alive
    return result.supported;
  });

  // Keep callback refs updated
  useEffect(() => { onPinClickRef.current = onPinClick; }, [onPinClick]);
  useEffect(() => { onPinHoverRef.current = onPinHover; }, [onPinHover]);

  // Load globe library dynamically (with delay to ensure WebGL is ready)
  useEffect(() => {
    if (!webGLSupported) {
      setError('WebGL not supported');
      setIsLoading(false);
      return;
    }

    // Small delay to ensure WebGL context is fully initialized
    const timeoutId = setTimeout(() => {
      import('globe.gl')
        .then((module) => {
          setGlobeGL(() => module.default);
        })
        .catch((err) => {
          console.error('Failed to load globe library:', err);
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`Globe library error: ${errorMsg}`);
          setIsLoading(false);
        });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [webGLSupported]);

  // Load globe data
  useEffect(() => {
    async function loadData() {
      try {
        const globeResult = await getGlobeData();

        if (globeResult.error) {
          setError(globeResult.error);
          setIsLoading(false);
          return;
        }

        if (globeResult.data) {
          setPoints(globeResult.data.points);
          setRoute(globeResult.data.route);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load globe data:', err);
        setError('Failed to load globe data');
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Initialize globe once when data is loaded
  useEffect(() => {
    if (!containerRef.current || isLoading || !GlobeGL) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    let globe: GlobeInstanceType;
    try {
      // Create basic globe instance first
      globe = new GlobeGL(container);
    } catch (err) {
      console.error('Failed to create GlobeGL instance:', err);
      setError('WebGL initialization failed');
      return;
    }

    try {
      // Configure globe appearance
      globe
        .width(width)
        .height(height)
        .backgroundColor('#0a1628')
        .atmosphereColor('#4a9eff')
        .atmosphereAltitude(0.15);
    } catch (err) {
      console.error('Failed to configure globe appearance:', err);
      setError('Globe configuration failed');
      return;
    }

    try {
      // Add the tile engine (use same for both mobile and desktop)
      globe.globeTileEngineUrl(OSM_TILE_URL);
    } catch (err) {
      console.error('Failed to set tile engine, trying fallback image:', err);
      try {
        // Fallback to simple image texture
        globe.globeImageUrl(GLOBE_IMAGE_URL);
      } catch (err2) {
        console.error('Fallback image also failed:', err2);
        setError('Globe texture failed');
        return;
      }
    }

    // Clear previous pin elements
    pinElementsRef.current.clear();

    // Configure HTML markers for pins (fixed pixel size regardless of zoom)
    // htmlTransitionDuration(0) prevents the "floaty" disconnect during interaction
    globe
      .htmlElementsData(points)
      .htmlLat((d) => (d as GlobePoint).lat)
      .htmlLng((d) => (d as GlobePoint).lng)
      .htmlAltitude(0)
      .htmlTransitionDuration(0)
      .htmlElement((d) => {
        const point = d as GlobePoint;
        const el = document.createElement('div');
        el.style.cssText = `
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${PIN_COLOR_DEFAULT};
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          cursor: pointer;
          transform: translate(-50%, -50%);
          pointer-events: auto;
        `;
        el.onmouseenter = () => {
          el.style.transform = 'translate(-50%, -50%) scale(1.3)';
          onPinHoverRef.current?.(point.id);
        };
        el.onmouseleave = () => {
          el.style.transform = 'translate(-50%, -50%)';
          onPinHoverRef.current?.(null);
        };
        el.onclick = (e) => { e.stopPropagation(); onPinClickRef.current?.(point.id); };
        // Store reference for later color updates
        pinElementsRef.current.set(point.id, el);
        return el;
      });

    // Route line: custom Three.js Line2 added directly to the scene.
    // This avoids z-fighting issues that pathsData/arcsData have with the globe
    // surface, by using polygonOffset to bias depth in the line's favour.
    // LineMaterial with worldUnits:false gives constant screen-space pixel width.
    const routeLines: Line2[] = [];
    const routeGeometries: LineGeometry[] = [];
    let routeMaterial: LineMaterial | null = null;
    let dashAnimId: number | null = null;

    if (route.length > 1) {
      // One line per leg — see buildRouteLegPositions for why the route is not
      // drawn as a single polyline.
      const legs = buildRouteLegPositions(route, 0.5);

      const DEFAULT_ALT = 1.8;
      const DASH_SIZE = 3;
      const GAP_SIZE = 1.5;
      const DASH_CYCLE = DASH_SIZE + GAP_SIZE;

      // Clip the line at the visible horizon rather than at the globe's centre
      // plane — see horizonPlaneOffset in lib/geo for why the difference matters.
      const clipPlane = new Plane();
      const camDir = new Vector3();
      const horizonPoint = new Vector3();
      const updateClipPlane = () => {
        const camPos = globe.camera().position;
        const d = camPos.length();
        if (d <= GLOBE_RADIUS) return; // camera inside the globe — nothing sensible to clip
        camDir.copy(camPos).divideScalar(d);
        horizonPoint.copy(camDir).multiplyScalar(horizonPlaneOffset(d));
        clipPlane.setFromNormalAndCoplanarPoint(camDir, horizonPoint);
      };
      updateClipPlane();

      routeMaterial = new LineMaterial({
        color: 0x0891b2,
        linewidth: 2,        // 2 CSS pixels
        worldUnits: false,    // screen-space width
        dashed: true,
        dashSize: DASH_SIZE,
        gapSize: GAP_SIZE,
        dashScale: 1,
        // Bypass depth testing entirely — the globe's tessellated surface
        // doesn't sit at exactly the same depth as the line, so any depth-based
        // approach (polygonOffset, LessEqualDepth) fails at high zoom.
        // The clipping plane hides the back hemisphere instead.
        depthTest: false,
        depthWrite: false,
        clippingPlanes: [clipPlane],
      });
      routeMaterial.resolution.set(width, height);

      // Enable local clipping on the renderer
      const renderer = globe.renderer();
      if (renderer) renderer.localClippingEnabled = true;

      for (const legPositions of legs) {
        const geometry = new LineGeometry();
        geometry.setPositions(legPositions);
        const line = new Line2(geometry, routeMaterial);
        line.renderOrder = 1;
        line.computeLineDistances();
        globe.scene().add(line);
        routeGeometries.push(geometry);
        routeLines.push(line);
      }

      // Drive the clipping plane, dash scale and dash offset from a single rAF
      // loop. The camera also moves outside of orbit-control gestures (pointOfView
      // tweens when a post is selected), so a 'change' listener alone would let the
      // horizon plane go stale mid-animation.
      let lastAnimTime = 0;
      let dashScale = DEFAULT_ALT / DEFAULT_ALT;
      const DASH_SPEED = 1.5; // world units per second
      const animateDashes = (time: number) => {
        const dt = lastAnimTime ? (time - lastAnimTime) / 1000 : 0;
        lastAnimTime = time;
        updateClipPlane();
        if (routeMaterial) {
          // Constant screen-size dashes: higher altitude -> fewer world units per
          // pixel. Only adopt a materially different scale: the shader multiplies
          // dashScale by distance along the leg, so re-deriving it from a
          // micro-varying altitude every frame makes the dashes visibly swim.
          const target = DEFAULT_ALT / globe.pointOfView().altitude;
          if (Math.abs(target - dashScale) / dashScale > 0.02) {
            dashScale = target;
            routeMaterial.dashScale = target;
          }
          // Constant rate — visual speed auto-compensates because a higher
          // dashScale maps the same offset to fewer world units. Wrapped to one
          // cycle so it cannot drift into magnitudes where float32 mod() in the
          // shader loses precision and the dashes collapse into a solid line.
          routeMaterial.dashOffset =
            ((routeMaterial.dashOffset - DASH_SPEED * dt) % DASH_CYCLE + DASH_CYCLE) % DASH_CYCLE;
        }
        dashAnimId = requestAnimationFrame(animateDashes);
      };
      routeMaterial.dashScale = dashScale;
      dashAnimId = requestAnimationFrame(animateDashes);
    }

    globeRef.current = globe;

    // Check if renderer initialized properly
    const renderer = globe.renderer();
    if (!renderer) {
      console.error('Three.js renderer failed to initialize');
      setError('3D renderer failed');
      return;
    }

    // Check for WebGL context loss
    const gl = renderer.getContext();
    if (gl.isContextLost()) {
      console.error('WebGL context is lost');
      setError('WebGL context lost');
      return;
    }

    // Set initial position based on first point or default to Europe
    if (points.length > 0) {
      const firstPoint = points[0];
      globe.pointOfView({ lat: firstPoint.lat, lng: firstPoint.lng, altitude: 1.8 }, 1000);
    } else {
      // Default to Europe view
      globe.pointOfView({ lat: 48, lng: 10, altitude: 1.8 }, 1000);
    }

    // Disable auto-rotate for easier pin clicking
    const controls = globe.controls();
    if (controls) {
      controls.autoRotate = false;
    }

    // Handle resize - use ResizeObserver for container size changes
    const handleResize = () => {
      if (containerRef.current && globeRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        if (newWidth > 0 && newHeight > 0) {
          globeRef.current.width(newWidth).height(newHeight);
          if (routeMaterial) routeMaterial.resolution.set(newWidth, newHeight);
        }
      }
    };

    // Watch for container size changes (e.g., mode switches)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (dashAnimId !== null) cancelAnimationFrame(dashAnimId);
      if (globeRef.current) {
        for (const line of routeLines) globeRef.current.scene().remove(line);
      }
      for (const geometry of routeGeometries) geometry.dispose();
      if (routeMaterial) routeMaterial.dispose();
      if (globeRef.current) {
        const renderer = globeRef.current.renderer();
        if (renderer) {
          renderer.dispose();
        }
        globeRef.current = null;
      }
    };
  }, [isLoading, points, route, GlobeGL]);

  // Update pin colors when selection changes (without recreating globe)
  useEffect(() => {
    pinElementsRef.current.forEach((el, id) => {
      el.style.background = id === selectedPostId ? PIN_COLOR_SELECTED : PIN_COLOR_DEFAULT;
    });
  }, [selectedPostId]);

  // Focus on selected post when it changes - keep current zoom level
  useEffect(() => {
    if (selectedPostId !== null && selectedPostId !== undefined && globeRef.current) {
      const point = points.find(p => p.id === selectedPostId);
      if (point) {
        // Get current point of view to preserve altitude (zoom level)
        const currentPov = globeRef.current.pointOfView();
        globeRef.current.pointOfView(
          { lat: point.lat, lng: point.lng, altitude: currentPov.altitude },
          1000
        );
      }
    }
  }, [selectedPostId, points]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-4">
        <svg className="w-16 h-16 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2"/>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12h20"/>
        </svg>
        <p className="text-slate-400 text-center">
          {error === 'WebGL not supported'
            ? '3D globe not supported on this device'
            : 'Could not load globe'}
        </p>
        <p className="text-slate-600 text-xs mt-2">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: '200px' }}>
      <div
        ref={containerRef}
        className="w-full h-full bg-slate-900"
      />
      {/* Zoom/Pan hint overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-white/40 pointer-events-none select-none">
        {/* Pan icon (hand) */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075-5.925a1.575 1.575 0 013.15 0v1.5m-3.15-1.5v5.925m0 0v3.9a2.4 2.4 0 01-2.4 2.4h-4.8a2.4 2.4 0 01-2.4-2.4v-5.1a2.1 2.1 0 012.1-2.1h.525m6.975 0v-3.075a1.575 1.575 0 10-3.15 0v3.075m3.15 0h.075a.75.75 0 01.75.75v.075" />
        </svg>
        {/* Zoom icon (magnifying glass with +) */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
        </svg>
      </div>
    </div>
  );
}
