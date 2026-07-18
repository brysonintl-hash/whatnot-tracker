declare module 'react-simple-maps' {
  import { CSSProperties, ReactNode, MouseEventHandler } from 'react';

  interface Geography {
    rsmKey: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface ComposableMapProps {
    projection?: string;
    style?: CSSProperties;
    width?: number;
    height?: number;
    children?: ReactNode;
  }

  interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (opts: { geographies: Geography[] }) => ReactNode;
    parseGeographies?: (geos: Geography[]) => Geography[];
  }

  interface GeographyProps {
    geography: Geography;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
    onMouseEnter?: MouseEventHandler<SVGPathElement>;
    onMouseLeave?: MouseEventHandler<SVGPathElement>;
    onClick?: MouseEventHandler<SVGPathElement>;
    [key: string]: unknown;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
  export function ZoomableGroup(props: { center?: [number, number]; zoom?: number; children?: ReactNode }): JSX.Element;
  export function Marker(props: { coordinates: [number, number]; children?: ReactNode }): JSX.Element;
  export function Line(props: Record<string, unknown>): JSX.Element;
  export function Sphere(props: Record<string, unknown>): JSX.Element;
  export function Graticule(props: Record<string, unknown>): JSX.Element;
}
